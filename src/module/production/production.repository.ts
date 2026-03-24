import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';

type Db = NodePgDatabase<typeof schema>;

@Injectable()
export class ProductionRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Db,
  ) {}

  async findRecipeWithItems(recipeId: number) {
    return this.db.query.recipes.findFirst({
      where: eq(schema.recipes.id, recipeId),
      with: { items: true, outputProduct: true },
    });
  }

  async createProductionOrder(
    data: typeof schema.productionOrders.$inferInsert,
  ) {
    const [row] = await this.db
      .insert(schema.productionOrders)
      .values(data)
      .returning();
    return row;
  }

  async findOrderById(tx: Db, id: string) {
    return tx.query.productionOrders.findFirst({
      where: eq(schema.productionOrders.id, id),
      with: {
        recipe: { with: { items: true } },
        reservations: true,
      },
    });
  }

  /** FEFO: tồn khả dụng > 0, sắp xếp theo HSD tăng dần */
  async listAvailableInventoryFefo(
    tx: Db,
    warehouseId: number,
    productId: number,
  ) {
    return tx
      .select({
        inventory: schema.inventory,
        batch: schema.batches,
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
          sql`(${schema.inventory.quantity}::numeric - ${schema.inventory.reservedQuantity}::numeric) > 0`,
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));
  }

  async updateReservedQuantity(
    tx: Db,
    inventoryId: number,
    addReserved: number,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        reservedQuantity: sql`${schema.inventory.reservedQuantity}::numeric + ${String(addReserved)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, inventoryId));
  }

  async insertReservation(
    tx: Db,
    data: typeof schema.productionReservations.$inferInsert,
  ) {
    const [row] = await tx
      .insert(schema.productionReservations)
      .values(data)
      .returning();
    return row;
  }

  async updateOrderStatus(
    tx: Db,
    orderId: string,
    status: (typeof schema.productionOrders.$inferSelect)['status'],
  ) {
    await tx
      .update(schema.productionOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.productionOrders.id, orderId));
  }

  async decreaseStockAndReserved(
    tx: Db,
    warehouseId: number,
    batchId: number,
    amount: number,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        quantity: sql`GREATEST((${schema.inventory.quantity}::numeric - ${String(
          amount,
        )}::numeric), 0)`,
        reservedQuantity: sql`GREATEST((${schema.inventory.reservedQuantity}::numeric - ${String(
          amount,
        )}::numeric), 0)`,
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
