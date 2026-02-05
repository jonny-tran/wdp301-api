import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, ilike, lte, sql } from 'drizzle-orm';
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
  async getInventorySummary(
    filters: {
      warehouseId?: number;
      categoryId?: number;
      searchTerm?: string;
    },
    options: { limit?: number; offset?: number },
  ) {
    const conditions = [
      gt(schema.batches.expiryDate, new Date().toISOString()),
    ];

    if (filters.warehouseId) {
      conditions.push(eq(schema.inventory.warehouseId, filters.warehouseId));
    }

    if (filters.searchTerm) {
      conditions.push(ilike(schema.products.name, `%${filters.searchTerm}%`));
    }
    // Note: categoryId filter is skipped as there is no categoryId in products schema yet based on previous view.
    // If categoryId is needed, we'd need to check if products has category_id. The view of schema.ts did not show category_id.

    return this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        warehouseId: schema.inventory.warehouseId,
        warehouseName: schema.warehouses.name,
        totalQuantity: sql<number>`sum(${schema.inventory.quantity})`.mapWith(
          Number,
        ),
        unit: schema.products.baseUnit,
        minStockLevel: schema.products.minStockLevel,
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
      .innerJoin(
        schema.warehouses,
        eq(schema.inventory.warehouseId, schema.warehouses.id),
      )
      .where(and(...conditions))
      .groupBy(
        schema.products.id,
        schema.products.name,
        schema.products.sku,
        schema.products.baseUnit,
        schema.products.minStockLevel,
        schema.inventory.warehouseId,
        schema.warehouses.name,
      )
      .limit(options.limit || 20)
      .offset(options.offset || 0);
  }

  async getLowStockItems(warehouseId?: number) {
    // Subquery to get total quantity per product
    // We only count batches that are NOT expired
    const sq = this.db
      .select({
        productId: schema.batches.productId,
        totalQuantity: sql<number>`sum(${schema.inventory.quantity})`.as(
          'total_quantity',
        ),
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          gt(schema.batches.expiryDate, new Date().toISOString()),
          warehouseId
            ? eq(schema.inventory.warehouseId, warehouseId)
            : undefined,
        ),
      )
      .groupBy(schema.batches.productId)
      .as('sq');

    return this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        minStockLevel: schema.products.minStockLevel,
        currentQuantity: sql<number>`coalesce(${sq.totalQuantity}, 0)`.mapWith(
          Number,
        ),
        unit: schema.products.baseUnit,
      })
      .from(schema.products)
      .leftJoin(sq, eq(schema.products.id, sq.productId))
      .where(
        lte(
          sql`coalesce(${sq.totalQuantity}, 0)`,
          schema.products.minStockLevel,
        ),
      );
  }

  async getBatchQuantity(warehouseId: number, batchId: number) {
    return this.db.query.inventory.findFirst({
      where: and(
        eq(schema.inventory.warehouseId, warehouseId),
        eq(schema.inventory.batchId, batchId),
      ),
    });
  }

  async adjustBatchQuantity(
    warehouseId: number,
    batchId: number,
    quantityChange: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    // Lock the row for update to ensure concurrency safety
    // Note: Drizzle's 'findFirst' doesn't support 'for update' directly easily in query builder without raw sql in some versions,
    // but we can use db.execute or select..for update.
    // The requirement says "Use SELECT ... FOR UPDATE to lock the batch row".

    // We verify existence and lock
    const [lockedInventory] = await tx
      .select()
      .from(schema.inventory)
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, batchId),
        ),
      )
      .for('update');

    if (!lockedInventory) {
      // If it doesn't exist, we might need to create it (if positive adjustment), but locking a non-existent row is impossible.
      // For adjustment of existing inventory, we expect it to exist or we handle insert if it allows positive creation.
      // However, standard adjustment usually implies modifying existing.
      // If we are adding stock to a new batch/warehouse combo, we just insert.
      if (quantityChange > 0) {
        const [inserted] = await tx
          .insert(schema.inventory)
          .values({
            warehouseId,
            batchId,
            quantity: quantityChange.toString(),
          })
          .returning();
        return inserted;
      }
      throw new Error('Inventory record not found for adjustment');
    }

    const newQuantity = Number(lockedInventory.quantity) + quantityChange;

    // Update
    const [updated] = await tx
      .update(schema.inventory)
      .set({
        quantity: newQuantity.toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, lockedInventory.id))
      .returning();

    return updated;
  }
}
