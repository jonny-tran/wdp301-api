import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';

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

  async findApprovedOrders(date?: string) {
    const conditions = [eq(schema.orders.status, OrderStatus.APPROVED)];

    if (date) {
      conditions.push(sql`DATE(${schema.orders.deliveryDate}) = ${date}`);
    }
    return this.db.query.orders.findMany({
      where: eq(schema.orders.status, OrderStatus.APPROVED),
      with: { store: true },
      orderBy: [asc(schema.orders.deliveryDate)],
    });
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

  async findAvailableBatchesForFefo(warehouseId: number, productId: number) {
    return this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        physicalQuantity: schema.inventory.quantity,
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
          sql`${schema.inventory.quantity} - ${schema.inventory.reservedQuantity} > 0`,
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));
  }

  async findBatchByCode(batchCode: string) {
    return this.db.query.batches.findFirst({
      where: eq(schema.batches.batchCode, batchCode),
    });
  }

  async findAvailableBatches(warehouseId: number, productId: number) {
    return this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
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
          gt(schema.inventory.quantity, '0'),
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));
  }

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
  async finalizeShipmentTransaction(
    warehouseId: number,
    shipmentId: string,
    orderId: string,
    shipmentItems: (typeof schema.shipmentItems.$inferSelect)[],
  ) {
    return this.db.transaction(async (tx) => {
      // 1. Trừ kho (Physical & Reserved)
      for (const item of shipmentItems) {
        const qty = parseFloat(item.quantity);
        await tx
          .update(schema.inventory)
          .set({
            quantity: sql`${schema.inventory.quantity} - ${qty}`,
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.inventory.warehouseId, warehouseId),
              eq(schema.inventory.batchId, item.batchId),
            ),
          );

        // Ghi log inventory transaction
        await tx.insert(schema.inventoryTransactions).values({
          warehouseId,
          batchId: item.batchId,
          type: 'export',
          quantityChange: (-qty).toString(),
          referenceId: shipmentId,
          reason: 'Order Dispatch',
        });
      }

      // 2. Update Shipment Status
      await tx
        .update(schema.shipments)
        .set({ status: 'in_transit', shipDate: new Date() })
        .where(eq(schema.shipments.id, shipmentId));

      // 3. Update Order Status
      await tx
        .update(schema.orders)
        .set({ status: OrderStatus.DELIVERING })
        .where(eq(schema.orders.id, orderId));
    });
  }

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
}
