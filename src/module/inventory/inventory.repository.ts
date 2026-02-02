import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';

@Injectable()
export class InventoryRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}
  async findWarehouseByStoreId(storeId: string) {
    return this.db.query.warehouses.findFirst({
      where: (warehouses) =>
        and(
          eq(warehouses.storeId, storeId),
          eq(warehouses.type, 'store_internal'),
        ),
    });
  }

  async getStoreInventory(warehouseId: number) {
    return this.db.query.inventory.findMany({
      where: eq(schema.inventory.warehouseId, warehouseId),
      with: {
        batch: {
          with: {
            product: true,
          },
        },
      },
      orderBy: (inventory, { asc }) => [asc(sql`${schema.batches.expiryDate}`)],
    });
  }

  async getStoreTransactions(
    warehouseId: number,
    options: {
      type?: 'import' | 'export' | 'waste' | 'adjustment';
      limit?: number;
      offset?: number;
    },
  ) {
    return this.db.query.inventoryTransactions.findMany({
      where: (tx) => {
        const conditions = [eq(tx.warehouseId, warehouseId)];
        if (options.type) {
          conditions.push(eq(tx.type, options.type));
        }
        return and(...conditions);
      },
      with: {
        batch: {
          with: {
            product: true,
          },
        },
      },
      orderBy: (tx, { desc }) => [desc(tx.createdAt)],
      limit: options.limit,
      offset: options.offset,
    });
  }

  async upsertInventory(
    warehouseId: number,
    batchId: number,
    quantityChange: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;

    // Check if inventory record exists
    const existing = await database.query.inventory.findFirst({
      where: and(
        eq(schema.inventory.warehouseId, warehouseId),
        eq(schema.inventory.batchId, batchId),
      ),
    });

    if (existing) {
      // Update existing record
      const newQuantity = parseFloat(existing.quantity) + quantityChange;
      const [updated] = await database
        .update(schema.inventory)
        .set({
          quantity: newQuantity.toString(),
          updatedAt: new Date(),
        })
        .where(eq(schema.inventory.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new record
      const [inserted] = await database
        .insert(schema.inventory)
        .values({
          warehouseId,
          batchId,
          quantity: quantityChange.toString(),
        })
        .returning();
      return inserted;
    }
  }

  async createInventoryTransaction(
    warehouseId: number,
    batchId: number,
    type: 'import' | 'export' | 'waste' | 'adjustment',
    quantityChange: number,
    referenceId?: string,
    reason?: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const [transaction] = await database
      .insert(schema.inventoryTransactions)
      .values({
        warehouseId,
        batchId,
        type,
        quantityChange: quantityChange.toString(),
        referenceId,
        reason,
      })
      .returning();
    return transaction;
  }
}
