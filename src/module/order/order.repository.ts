import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { ORDERABLE_PRODUCT_TYPE_VALUES } from '../product/constants/product-type.enum';
import { OrderStatus } from './constants/order-status.enum';
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';

@Injectable()
export class OrderRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly catalogFilterMap: FilterMap<typeof schema.products> = {
    search: { column: schema.products.name, operator: 'ilike' },
    isActive: { column: schema.products.isActive, operator: 'eq' },
    /** Luôn set từ server — không nhận từ client (catalog đặt hàng) */
    catalogSellableTypes: {
      column: schema.products.type,
      operator: 'in',
    },
  };

  async findAll(query: GetOrdersDto) {
    const {
      page = 1,
      limit = 10,
      search,
      storeId,
      status,
      fromDate,
      toDate,
    } = query;
    const offset = (Number(page) - 1) * Number(limit);
    const isPaginationDisabled = !query.limit;

    const conditions: SQL[] = [];

    if (storeId) {
      conditions.push(eq(schema.orders.storeId, storeId));
    }

    if (status) {
      conditions.push(eq(schema.orders.status, status));
    }

    if (fromDate) {
      conditions.push(gte(schema.orders.createdAt, new Date(fromDate)));
    }

    if (toDate) {
      conditions.push(lte(schema.orders.createdAt, new Date(toDate)));
    }

    if (search) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(search)) {
        // If valid UUID, exact match ID
        conditions.push(eq(schema.orders.id, search));
      } else {
        // Fallback to text match with cast
        const searchCondition = or(
          sql`${schema.orders.id}::text ILIKE ${'%' + search + '%'}`,
          sql`${schema.stores.name} ILIKE ${'%' + search + '%'}`,
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = this.db
      .select({
        orders: schema.orders,
        store: schema.stores,
      })
      .from(schema.orders)
      .leftJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(whereCondition)
      .orderBy(desc(schema.orders.createdAt));

    const itemsQuery = isPaginationDisabled
      ? baseQuery
      : baseQuery.limit(Number(limit)).offset(offset);

    const [totalResult, items] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.orders)
        .leftJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .where(whereCondition),
      itemsQuery,
    ]);

    const totalItems = Number(totalResult[0]?.count || 0);

    const formattedItems = items.map((row) => ({
      ...row.orders,
      store: row.store,
    }));

    return {
      items: formattedItems,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: isPaginationDisabled ? totalItems : Number(limit),
        totalPages: isPaginationDisabled
          ? 1
          : Math.ceil(totalItems / (Number(limit) || 1)),
        currentPage: isPaginationDisabled ? 1 : Number(page),
      },
    };
  }

  /**
   * Catalog đặt hàng: chỉ `finished_good` + `resell_product`, phân trang chuẩn paginate.
   */
  async getOrderCatalogProducts(query: GetCatalogDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const merged = {
      ...query,
      page,
      limit,
      isActive: query.isActive !== false,
      catalogSellableTypes: ORDERABLE_PRODUCT_TYPE_VALUES.join(','),
    } as PaginationParamsDto & Record<string, unknown>;
    return paginate(
      this.db,
      schema.products,
      merged,
      this.catalogFilterMap,
    );
  }

  async findActiveProductsByIds(
    productIds: number[],
    options?: { orderableOnly?: boolean },
  ) {
    if (productIds.length === 0) return [];
    const conditions: SQL[] = [
      inArray(schema.products.id, productIds),
      eq(schema.products.isActive, true),
    ];
    if (options?.orderableOnly) {
      conditions.push(inArray(schema.products.type, ORDERABLE_PRODUCT_TYPE_VALUES));
    }
    return this.db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(and(...conditions));
  }

  /** Catalog fields để snapshot + lead time */
  async findProductsWithSnapshotByIds(
    productIds: number[],
    options?: { orderableOnly?: boolean },
  ) {
    if (productIds.length === 0) return [];
    const conditions: SQL[] = [
      inArray(schema.products.id, productIds),
      eq(schema.products.isActive, true),
    ];
    if (options?.orderableOnly) {
      conditions.push(inArray(schema.products.type, ORDERABLE_PRODUCT_TYPE_VALUES));
    }
    return this.db
      .select({
        id: schema.products.id,
        unitPrice: schema.products.unitPrice,
        prepTimeHours: schema.products.prepTimeHours,
        packagingInfo: schema.products.packagingInfo,
        isHighValue: schema.products.isHighValue,
        weightKg: schema.products.weightKg,
        volumeM3: schema.products.volumeM3,
        unitName: schema.baseUnits.name,
      })
      .from(schema.products)
      .innerJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(and(...conditions));
  }

  async getStoreById(storeId: string, tx?: NodePgDatabase<typeof schema>) {
    const database = tx || this.db;
    return database.query.stores.findFirst({
      where: eq(schema.stores.id, storeId),
    });
  }

  /** Tồn kho thực tế tại kho cửa hàng theo productId */
  async sumStoreInventoryByProduct(
    storeWarehouseId: number,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<Map<number, number>> {
    const database = tx || this.db;
    const rows = await database
      .select({
        productId: schema.batches.productId,
        total: sql<string>`coalesce(sum(${schema.inventory.quantity}::numeric), 0)`,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(eq(schema.inventory.warehouseId, storeWarehouseId))
      .groupBy(schema.batches.productId);
    return new Map(rows.map((r) => [r.productId, parseFloat(r.total)]));
  }

  /**
   * Gộp đơn: tìm group đã có đơn PENDING cùng ngày giao (VN) trong ngày đặt hiện tại.
   */
  async findExistingConsolidationGroupId(
    storeId: string,
    deliveryDate: Date,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<string | null> {
    const database = tx || this.db;
    const base = database
      .select({ consolidationGroupId: schema.orders.consolidationGroupId })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.storeId, storeId),
          eq(schema.orders.status, OrderStatus.PENDING),
          sql`DATE(${schema.orders.deliveryDate}) = DATE(${deliveryDate})`,
          sql`DATE(${schema.orders.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
        ),
      )
      .orderBy(asc(schema.orders.createdAt))
      .limit(1);
    const [row] = await (tx ? base.for('update') : base);
    return row?.consolidationGroupId ?? null;
  }

  /** Khóa phiên đặt hàng theo cửa hàng — tránh race khi spam API */
  async acquireStoreOrderingLock(
    storeId: string,
    tx: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`order_store:${storeId}`}::text)::bigint)`,
    );
  }

  /** FOR UPDATE các dòng tồn kho liên quan sản phẩm trong đơn (cùng transaction) */
  async lockStoreInventoryRowsForProducts(
    storeWarehouseId: number,
    productIds: number[],
    tx: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    if (productIds.length === 0) return;
    await tx
      .select({ id: schema.inventory.id })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, storeWarehouseId),
          inArray(schema.batches.productId, productIds),
        ),
      )
      .for('update');
  }

  /** Nợ chứng từ: chuyến in_transit quá 48h kể từ ship_date */
  async hasStaleUnconfirmedShipment(
    storeId: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<boolean> {
    const database = tx || this.db;
    const rows = await database
      .select({ id: schema.shipments.id })
      .from(schema.shipments)
      .innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.orders.storeId, storeId),
          eq(schema.shipments.status, 'in_transit'),
          sql`${schema.shipments.shipDate} IS NOT NULL`,
          sql`${schema.shipments.shipDate} < NOW() - INTERVAL '48 hours'`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async setOrderProductionFlag(
    orderId: string,
    value: boolean,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    await database
      .update(schema.orders)
      .set({ requiresProductionConfirm: value, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));
  }

  async setOrderPendingPriceConfirm(
    orderId: string,
    value: boolean,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    await database
      .update(schema.orders)
      .set({ pendingPriceConfirm: value, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));
  }

  async findShipmentByOrderId(
    orderId: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const primary = await database.query.shipments.findFirst({
      where: eq(schema.shipments.orderId, orderId),
    });
    if (primary) return primary;
    const [linked] = await database
      .select({ shipment: schema.shipments })
      .from(schema.shipmentOrders)
      .innerJoin(
        schema.shipments,
        eq(schema.shipmentOrders.shipmentId, schema.shipments.id),
      )
      .where(eq(schema.shipmentOrders.orderId, orderId))
      .limit(1);
    return linked?.shipment ?? null;
  }

  async releaseReservationsForShipment(
    shipmentId: string,
    centralWarehouseId: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    const items = await tx.query.shipmentItems.findMany({
      where: eq(schema.shipmentItems.shipmentId, shipmentId),
    });
    for (const line of items) {
      const qty = parseFloat(line.quantity);
      if (qty <= 0) continue;
      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`GREATEST((${schema.inventory.reservedQuantity})::numeric - ${String(qty)}, 0)`,
        })
        .where(
          and(
            eq(schema.inventory.warehouseId, centralWarehouseId),
            eq(schema.inventory.batchId, line.batchId),
          ),
        );
    }
  }

  async insertRestockTask(
    orderId: string,
    shipmentId: string | null,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    await database.insert(schema.restockTasks).values({
      orderId,
      shipmentId,
      status: 'pending',
    });
  }

  async getOrdersByStore(storeId: string) {
    return this.db.query.orders.findMany({
      where: eq(schema.orders.storeId, storeId),
      orderBy: [desc(schema.orders.createdAt)],
      with: {
        items: {
          with: {
            product: true,
          },
        },
      },
    });
  }

  async insertOrderWithItems(
    tx: NodePgDatabase<typeof schema>,
    params: {
      storeId: string;
      deliveryDate: Date;
      items: Array<{
        productId: number;
        quantity: number;
        unitSnapshot: string;
        priceSnapshot: string;
        packagingInfoSnapshot: string | null;
      }>;
      consolidationGroupId: string;
      totalAmount: string;
    },
  ) {
    const { storeId, deliveryDate, items, consolidationGroupId, totalAmount } =
      params;
    const [newOrder] = await tx
      .insert(schema.orders)
      .values({
        storeId: storeId,
        status: OrderStatus.PENDING,
        deliveryDate,
        consolidationGroupId,
        totalAmount,
      })
      .returning();

    if (!newOrder) {
      throw new Error('Không thể tạo đơn hàng');
    }

    if (items.length > 0) {
      await tx.insert(schema.orderItems).values(
        items.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          quantityRequested: item.quantity.toString(),
          quantityApproved: null,
          unitSnapshot: item.unitSnapshot,
          priceSnapshot: item.priceSnapshot,
          packagingInfoSnapshot: item.packagingInfoSnapshot,
        })),
      );
    }

    return newOrder;
  }

  async getOrdersForCoordinator(status: OrderStatus = OrderStatus.PENDING) {
    return this.db.query.orders.findMany({
      where: eq(schema.orders.status, status),
      orderBy: [desc(schema.orders.createdAt)],
      with: {
        store: true,
      },
    });
  }

  async getCentralWarehouseId(tx?: NodePgDatabase<typeof schema>) {
    const database = tx || this.db;
    const warehouse = await database.query.warehouses.findFirst({
      where: eq(schema.warehouses.type, 'central'),
    });
    return warehouse ? warehouse.id : null;
  }

  async getStoreWarehouseId(
    storeId: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const warehouse = await database.query.warehouses.findFirst({
      where: eq(schema.warehouses.storeId, storeId),
    });
    return warehouse ? warehouse.id : null;
  }

  async getBatchesForFEFO(
    productId: number,
    warehouseId: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const base = database
      .select({
        inventoryId: schema.inventory.id,
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        quantity: schema.inventory.quantity,
        reservedQuantity: schema.inventory.reservedQuantity,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.batches.productId, productId),
          sql`${schema.inventory.quantity}::numeric > ${schema.inventory.reservedQuantity}::numeric`,
          sql`${schema.batches.expiryDate}::date > CURRENT_DATE + (COALESCE(${schema.products.minShelfLife}, 0)::int * interval '1 day')`,
          ne(schema.batches.status, 'expired'),
          ne(schema.batches.status, 'damaged'),
          ne(schema.batches.status, 'empty'),
        ),
      )
      .orderBy(schema.batches.expiryDate);
    return tx ? base.for('update') : base;
  }

  async getOrderById(orderId: string, tx?: NodePgDatabase<typeof schema>) {
    const database = tx || this.db;
    return await database.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
      with: {
        items: {
          with: {
            product: true,
          },
        },
        store: {
          with: {
            route: true,
          },
        },
      },
    });
  }

  /**
   * Cập nhật atomically các dòng đơn (duyệt + snapshot giá) và header đơn trong cùng transaction.
   */
  async applySmartOrderApproval(
    tx: NodePgDatabase<typeof schema>,
    params: {
      orderId: string;
      status: OrderStatus;
      orderNote: string | null;
      totalAmount: string;
      itemRows: Array<{
        orderItemId: number;
        quantityApproved: string;
        unitPriceAtOrder: string;
        unitCostAtImport: string | null;
      }>;
    },
  ): Promise<void> {
    for (const row of params.itemRows) {
      await tx
        .update(schema.orderItems)
        .set({
          quantityApproved: row.quantityApproved,
          unitPriceAtOrder: row.unitPriceAtOrder,
          unitCostAtImport: row.unitCostAtImport,
        })
        .where(eq(schema.orderItems.id, row.orderItemId));
    }

    await tx
      .update(schema.orders)
      .set({
        status: params.status,
        totalAmount: params.totalAmount,
        note: params.orderNote,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, params.orderId));
  }

  async updateStatusWithReason(
    id: string,
    status: OrderStatus,
    reason: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    if (status === OrderStatus.CANCELLED) {
      await database
        .update(schema.orders)
        .set({
          status,
          cancelReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, id));
      return;
    }
    if (status === OrderStatus.REJECTED) {
      await database
        .update(schema.orders)
        .set({
          status,
          note: reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, id));
      return;
    }
    await database
      .update(schema.orders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id));
  }

  async reserveInventory(
    inventoryId: number,
    quantityToReserve: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${quantityToReserve}`,
      })
      .where(eq(schema.inventory.id, inventoryId));
  }

  async updateOrderApproved(
    orderId: string,
    tx: NodePgDatabase<typeof schema>,
  ) {
    await tx
      .update(schema.orders)
      .set({
        status: OrderStatus.APPROVED,
      })
      .where(eq(schema.orders.id, orderId));
  }

  async updateOrderItemApprovedQuantity(
    orderItemId: number,
    approvedQuantity: string,
    tx: NodePgDatabase<typeof schema>,
  ) {
    await tx
      .update(schema.orderItems)
      .set({
        quantityApproved: approvedQuantity,
      })
      .where(eq(schema.orderItems.id, orderItemId));
  }

  async runTransaction<T>(
    work: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(work);
  }

  // API: Analytics Fulfillment Rate
  async getFulfillmentAnalytics(storeId?: string, from?: string, to?: string) {
    const conditions: SQL[] = [];

    // Filter conditions
    if (storeId) conditions.push(eq(schema.orders.storeId, storeId));
    if (from) conditions.push(gte(schema.orders.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.orders.createdAt, toDate));
    }

    return this.db
      .select({
        //  Requested + Approved
        totalRequested: sql<number>`CAST(SUM(${schema.orderItems.quantityRequested}) AS FLOAT)`,
        totalApproved: sql<number>`CAST(SUM(COALESCE(${schema.orderItems.quantityApproved}, 0)) AS FLOAT)`,
        //  chênh lệch (Shortfall)
        shortfallQty: sql<number>`CAST(SUM(${schema.orderItems.quantityRequested} - COALESCE(${schema.orderItems.quantityApproved}, 0)) AS FLOAT)`,
        // Gom nhóm theo lý do (lưu trong note của Order)
        reason: schema.orders.note,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(schema.orders.note);
  }

  // --- API 5: Analytics SLA / Lead Time ---
  async getSlaAnalytics(from?: string, to?: string) {
    const conditions: SQL[] = [];
    if (from) conditions.push(gte(schema.orders.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.orders.createdAt, toDate));
    }

    return this.db
      .select({
        orderId: schema.orders.id,
        orderCreatedAt: schema.orders.createdAt,
        shipmentCreatedAt: schema.shipments.createdAt,
        shipDate: schema.shipments.shipDate,
        shipmentUpdatedAt: schema.shipments.updatedAt,
        shipmentStatus: schema.shipments.status,
      })
      .from(schema.orders)
      .innerJoin(
        schema.shipments,
        eq(schema.orders.id, schema.shipments.orderId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined);
  }
}
