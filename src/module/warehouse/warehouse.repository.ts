import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

@Injectable()
export class WarehouseRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
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
      eq(schema.orders.status, OrderStatus.APPROVED),
    ];

    if (date) {
      whereConditions.push(sql`DATE(${schema.orders.deliveryDate}) = ${date}`);
    }

    if (search) {
      const searchCondition = or(
        ilike(schema.orders.id, `%${search}%`),
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
  ) {
    return this.db.transaction(async (tx) => {
      const qtyNeeded = parseFloat(shipmentItem.quantity);

      // 1. Xóa Shipment Item cũ
      await tx
        .delete(schema.shipmentItems)
        .where(eq(schema.shipmentItems.id, shipmentItem.id));

      // 2. Giảm Reserved Qty lô hỏng
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

      // 3. Tìm lô mới (FEFO Logic inside Transaction)
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

      // 4. Phân bổ lại lô mới
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
    });
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
}
