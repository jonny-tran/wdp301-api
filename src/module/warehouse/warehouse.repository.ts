import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { VN_TZ } from '../../common/time/vn-time';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { OrderStatus } from '../order/constants/order-status.enum';
import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class WarehouseRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  // --- Helpers ---
  private getDb(tx?: NodePgDatabase<typeof schema>) {
    return tx ?? this.db;
  }

  // --- Queries & Mutations ---

  async findCentralWarehouseId() {
    return this.db.query.warehouses.findFirst({
      where: eq(schema.warehouses.type, 'central'),
    });
  }

  /**
   * Lô hàng tại kho trung tâm: HSD (ngày) > mốc an toàn, kèm quantity / reserved từ inventory, FEFO.
   */
  async findValidBatches(
    productId: number,
    safetyThreshold: Date,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const central = await this.findCentralWarehouseId();
    if (!central) return [];
    const safetyMinimumExpiryDateStr = dayjs(safetyThreshold)
      .tz(VN_TZ)
      .format('YYYY-MM-DD');
    return this.inventoryRepository.findBatchesForAtpFefo(
      productId,
      central.id,
      safetyMinimumExpiryDateStr,
      tx,
    );
  }

  async createWarehouse(
    data: typeof schema.warehouses.$inferInsert,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.getDb(tx).insert(schema.warehouses).values(data).returning();
  }

  async findApprovedOrders(query: GetPickingTasksDto) {
    const { page = 1, limit = 10, search, date } = query;
    const offset = (page - 1) * limit;

    const whereConditions: SQL[] = [
      inArray(schema.orders.status, [
        OrderStatus.APPROVED,
        OrderStatus.PICKING,
      ]),
    ];

    if (date) {
      whereConditions.push(sql`DATE(${schema.orders.deliveryDate}) = ${date}`);
    }

    if (search) {
      const searchCondition = or(
        sql`${schema.orders.id}::text ILIKE ${'%' + search + '%'}`,
        ilike(schema.stores.name, `%${search}%`),
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    // Main Query
    const data = await this.db
      .select({
        id: schema.orders.id,
        status: schema.orders.status,
        deliveryDate: schema.orders.deliveryDate,
        createdAt: schema.orders.createdAt,
        storeName: schema.stores.name,
        itemCount: sql<number>`count(${schema.orderItems.id})`,
      })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .leftJoin(
        schema.orderItems,
        eq(schema.orders.id, schema.orderItems.orderId),
      )
      .where(whereConditions.length ? and(...whereConditions) : undefined)
      .limit(limit)
      .offset(offset)
      .groupBy(schema.orders.id, schema.stores.id)
      .orderBy(asc(schema.orders.deliveryDate));

    // Count Query (Distinct Orders)
    const totalResult = await this.db
      .select({ count: count(schema.orders.id) })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(whereConditions.length ? and(...whereConditions) : undefined);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items: data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async findShipmentByOrderId(orderId: string) {
    return this.db.query.shipments.findFirst({
      where: eq(schema.shipments.orderId, orderId),
      with: {
        items: {
          with: { batch: { with: { product: true } } },
        },
      },
    });
  }

  async findShipmentById(shipmentId: string) {
    return this.db.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
      with: {
        order: { with: { store: true } },
        items: {
          with: { batch: { with: { product: true } } },
        },
      },
    });
  }

  // warehouse.repository.ts

  async findBatchWithInventory(warehouseId: number, batchCode: string) {
    return this.db.query.batches.findFirst({
      where: eq(schema.batches.batchCode, batchCode),
      with: {
        product: true,
        inventory: {
          where: eq(schema.inventory.warehouseId, warehouseId),
        },
      },
    });
  }

  // --- Transactions Complex Logic ---

  /**
   * Thực hiện Transaction trừ kho và cập nhật trạng thái đơn hàng
   */

  /**
   * Transaction xử lý báo cáo hàng hỏng và đổi lô
   */
  async replaceDamagedBatchTransaction(
    warehouseId: number,
    dto: { batchId: number },
    shipmentItem: { id: number; quantity: string; shipmentId: string },
    productId: number,
    existingTx?: NodePgDatabase<typeof schema>,
  ) {
    const run = async (tx: NodePgDatabase<typeof schema>) => {
      const qtyNeeded = parseFloat(shipmentItem.quantity);

      await tx
        .delete(schema.shipmentItems)
        .where(eq(schema.shipmentItems.id, shipmentItem.id));

      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qtyNeeded}`,
        })
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.inventory.batchId, dto.batchId),
          ),
        );

      const candidateBatches = await tx
        .select()
        .from(schema.inventory)
        .innerJoin(
          schema.batches,
          eq(schema.inventory.batchId, schema.batches.id),
        )
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.batches.productId, productId),
            sql`${schema.inventory.batchId} != ${dto.batchId}`,
            sql`(${schema.inventory.quantity} - ${schema.inventory.reservedQuantity}) > 0`,
          ),
        )
        .orderBy(asc(schema.batches.expiryDate));

      let remainingToPick = qtyNeeded;
      const newAllocations: { batch: string; qty: number }[] = [];

      for (const candidate of candidateBatches) {
        if (remainingToPick <= 0) break;
        const available =
          parseFloat(candidate.inventory.quantity) -
          parseFloat(candidate.inventory.reservedQuantity);
        const take = Math.min(available, remainingToPick);

        await tx.insert(schema.shipmentItems).values({
          shipmentId: shipmentItem.shipmentId,
          batchId: candidate.batches.id,
          suggestedBatchId: candidate.batches.id,
          quantity: take.toString(),
        });

        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${take}`,
          })
          .where(eq(schema.inventory.id, candidate.inventory.id));

        newAllocations.push({
          batch: candidate.batches.batchCode,
          qty: take,
        });

        remainingToPick -= take;
      }

      return { remainingToPick, newAllocations };
    };

    if (existingTx) return run(existingTx);
    return this.db.transaction(run);
  }

  async findShipmentsReadyForManifest(
    orderIds: string[],
    centralWarehouseId: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.getDb(tx).query.shipments.findMany({
      where: and(
        inArray(schema.shipments.orderId, orderIds),
        eq(schema.shipments.fromWarehouseId, centralWarehouseId),
        eq(schema.shipments.status, 'preparing'),
        isNull(schema.shipments.manifestId),
      ),
      with: {
        items: { with: { batch: { with: { product: true } } } },
      },
    });
  }

  async findManifestById(
    id: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.getDb(tx).query.manifests.findFirst({
      where: eq(schema.manifests.id, id),
      with: {
        pickingList: {
          with: {
            items: { with: { product: { with: { baseUnit: true } } } },
          },
        },
        shipments: {
          with: {
            order: { with: { store: true } },
            items: {
              with: {
                batch: { with: { product: true } },
                suggestedBatch: true,
                actualBatch: true,
              },
            },
          },
        },
      },
    });
  }

  async syncPickingListPickedTotals(
    manifestId: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    const rows = await tx
      .select({
        productId: schema.batches.productId,
        pickedSum: sql<string>`coalesce(sum(${schema.shipmentItems.quantity}::numeric), 0)`,
      })
      .from(schema.shipmentItems)
      .innerJoin(
        schema.shipments,
        eq(schema.shipmentItems.shipmentId, schema.shipments.id),
      )
      .innerJoin(
        schema.batches,
        eq(schema.shipmentItems.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.shipments.manifestId, manifestId),
          isNotNull(schema.shipmentItems.actualBatchId),
        ),
      )
      .groupBy(schema.batches.productId);

    const pickedByProduct = new Map<number, string>();
    for (const r of rows) {
      pickedByProduct.set(r.productId, String(r.pickedSum));
    }

    const list = await tx.query.pickingLists.findFirst({
      where: eq(schema.pickingLists.manifestId, manifestId),
    });
    if (!list) return;

    const plItems = await tx.query.pickingListItems.findMany({
      where: eq(schema.pickingListItems.pickingListId, list.id),
    });

    for (const pl of plItems) {
      const picked = pickedByProduct.get(pl.productId) ?? '0';
      await tx
        .update(schema.pickingListItems)
        .set({ totalPickedQuantity: picked })
        .where(eq(schema.pickingListItems.id, pl.id));
    }
  }

  // Helper để Service dùng khi cần query inventory trong transaction logic riêng (nếu có)
  async findInventory(warehouseId: number, batchId: number) {
    return this.db.query.inventory.findFirst({
      where: and(
        eq(schema.inventory.warehouseId, warehouseId),
        eq(schema.inventory.batchId, batchId),
      ),
    });
  }

  async findShipmentItemByBatch(batchId: number) {
    return this.db.query.shipmentItems.findFirst({
      where: eq(schema.shipmentItems.batchId, batchId),
    });
  }

  async decreaseStockFinal(
    warehouseId: number,
    batchId: number,
    amount: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    if (amount <= 0) return;
    return this.getDb(tx)
      .update(schema.inventory)
      .set({
        quantity: sql`${schema.inventory.quantity} - ${amount}`,
        reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, batchId),
        ),
      );
  }

  async findShipmentItemById(
    id: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.getDb(tx).query.shipmentItems.findFirst({
      where: eq(schema.shipmentItems.id, id),
      with: {
        shipment: true,
        batch: { with: { product: true } },
        suggestedBatch: true,
        actualBatch: true,
      },
    });
  }

  /**
   * Tổng tải trọng/ thể tích gom đơn theo từng order:
   * - totalWeightKg = Σ(quantity_approved × product.weight_kg)
   * - totalVolumeM3 = Σ(quantity_approved × product.volume_m3)
   * route_id lấy từ store.
   */
  async findOrderLoadsAndRoutes(
    orderIds: string[],
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<
    Array<{
      orderId: string;
      routeId: number | null;
      totalWeightKg: number;
      totalVolumeM3: number;
    }>
  > {
    if (orderIds.length === 0) return [];
    const rows = await this.getDb(tx)
      .select({
        orderId: schema.orders.id,
        routeId: schema.stores.routeId,
        totalWeightKg: sql<string>`COALESCE(SUM(COALESCE(${schema.orderItems.quantityApproved}, 0)::numeric * COALESCE(${schema.products.weightKg}, 0)), 0)`,
        totalVolumeM3: sql<string>`COALESCE(SUM(COALESCE(${schema.orderItems.quantityApproved}, 0)::numeric * COALESCE(${schema.products.volumeM3}, 0)), 0)`,
      })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .innerJoin(
        schema.orderItems,
        eq(schema.orderItems.orderId, schema.orders.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.orderItems.productId, schema.products.id),
      )
      .where(inArray(schema.orders.id, orderIds))
      .groupBy(schema.orders.id, schema.stores.routeId);

    return rows.map((r) => ({
      orderId: r.orderId,
      routeId: r.routeId,
      totalWeightKg: Number(r.totalWeightKg),
      totalVolumeM3: Number(r.totalVolumeM3),
    }));
  }

  async findVehicleById(
    vehicleId: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.getDb(tx).query.vehicles.findFirst({
      where: eq(schema.vehicles.id, vehicleId),
    });
  }
}
