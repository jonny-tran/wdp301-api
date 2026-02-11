import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from './constants/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';

@Injectable()
export class OrderRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly filterMap: FilterMap<typeof schema.orders> = {
    status: { column: schema.orders.status, operator: 'eq' },
    storeId: { column: schema.orders.storeId, operator: 'eq' },
    search: { column: schema.orders.id, operator: 'ilike' },
    fromDate: { column: schema.orders.createdAt, operator: 'gte' },
    toDate: { column: schema.orders.createdAt, operator: 'lte' },
  };

  private readonly catalogFilterMap: FilterMap<typeof schema.products> = {
    search: { column: schema.products.name, operator: 'ilike' },
    isActive: { column: schema.products.isActive, operator: 'eq' },
  };

  async findAll(query: GetOrdersDto) {
    return paginate(
      this.db,
      schema.orders,
      query as PaginationParamsDto & Record<string, unknown>,
      this.filterMap,
    );
  }

  async getActiveProducts(query: GetCatalogDto) {
    return paginate(
      this.db,
      schema.products,
      query as PaginationParamsDto & Record<string, unknown>,
      this.catalogFilterMap,
    );
  }

  async findActiveProductsByIds(productIds: number[]) {
    return this.db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          inArray(schema.products.id, productIds),
          eq(schema.products.isActive, true),
        ),
      );
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

  async createOrderTransaction(
    storeId: string,
    deliveryDate: string,
    items: CreateOrderDto['items'],
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Create Order
      const [newOrder] = await tx
        .insert(schema.orders)
        .values({
          storeId: storeId,
          status: OrderStatus.PENDING,
          deliveryDate: new Date(deliveryDate),
        })
        .returning();

      if (!newOrder) {
        throw new Error('Không thể tạo đơn hàng');
      }

      // 2. Create Order Items
      if (items.length > 0) {
        await tx.insert(schema.orderItems).values(
          items.map((item) => ({
            orderId: newOrder.id,
            productId: item.productId,
            quantityRequested: item.quantity.toString(),
            quantityApproved: null,
          })),
        );
      }

      return newOrder;
    });
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
    return database
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
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.batches.productId, productId),
          sql`${schema.inventory.quantity} > ${schema.inventory.reservedQuantity}`,
        ),
      )
      .orderBy(schema.batches.expiryDate);
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
        store: true,
      },
    });
  }

  async updateStatusWithReason(
    id: string,
    status: OrderStatus,
    reason: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    await database
      .update(schema.orders)
      .set({
        status: status,
        note: reason, // Using 'note' to store rejection/cancellation reason
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
}
