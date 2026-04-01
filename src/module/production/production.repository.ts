/**
 * Truy vấn lệnh sản xuất / FEFO / reservation.
 * Số lượng từ DB (numeric) nên được truyền sang service dưới dạng string
 * và được parse bằng `fromDbDecimal` trước khi so sánh.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { VN_TZ } from '../../common/time/vn-time';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';

dayjs.extend(utc);
dayjs.extend(timezone);

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

  /** Mọi công thức active cho cùng một thành phẩm (service chỉ chấp nhận đúng 1 bản ghi). */
  async findActiveRecipesByOutputProductId(outputProductId: number) {
    return this.db.query.recipes.findMany({
      where: and(
        eq(schema.recipes.outputProductId, outputProductId),
        eq(schema.recipes.isActive, true),
      ),
      with: { items: true, outputProduct: true },
      orderBy: desc(schema.recipes.id),
    });
  }

  async createRecipe(data: {
    name: string;
    productId: number;
    items: { productId: number; quantity: string }[];
  }) {
    return this.db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(schema.recipes)
        .values({
          outputProductId: data.productId,
          name: data.name,
          isActive: true,
        })
        .returning();

      if (data.items.length > 0) {
        await tx.insert(schema.recipeItems).values(
          data.items.map((i) => ({
            recipeId: recipe.id,
            ingredientProductId: i.productId,
            quantityPerOutput: i.quantity,
          })),
        );
      }

      return tx.query.recipes.findFirst({
        where: eq(schema.recipes.id, recipe.id),
        with: { items: true, outputProduct: true },
      });
    });
  }

  async generateNextProductionOrderCode(tx: Db): Promise<string> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(871003, 1)`);
    const dayStr = dayjs().tz(VN_TZ).format('YYYYMMDD');
    const prefix = `PO-${dayStr}-`;
    const likePattern = `${prefix}%`;
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.productionOrders)
      .where(sql`${schema.productionOrders.code} like ${likePattern}`);
    const next = (row?.n ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async createProductionOrder(
    data: typeof schema.productionOrders.$inferInsert,
    tx?: Db,
  ) {
    const runner = tx ?? this.db;
    const [row] = await runner
      .insert(schema.productionOrders)
      .values(data)
      .returning();
    return row;
  }

  async findBatchByCode(tx: Db, batchCode: string) {
    return tx.query.batches.findFirst({
      where: eq(schema.batches.batchCode, batchCode),
    });
  }

  async findOrderById(tx: Db, id: string) {
    return tx.query.productionOrders.findFirst({
      where: eq(schema.productionOrders.id, id),
      with: {
        recipe: { with: { items: true } },
        reservations: { with: { batch: true } },
      },
    });
  }

  /** FEFO: tồn khả dụng > 0, sắp xếp HSD tăng dần (kiểm tra hạn dùng tại service) */
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

  async markOrderStarted(tx: Db, orderId: string) {
    await tx
      .update(schema.productionOrders)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.productionOrders.id, orderId));
  }

  async markOrderCompleted(
    tx: Db,
    orderId: string,
    actualQuantity: string,
  ) {
    await tx
      .update(schema.productionOrders)
      .set({
        status: 'completed',
        actualQuantity,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.productionOrders.id, orderId));
  }

  async insertBatchLineage(
    tx: Db,
    data: typeof schema.batchLineage.$inferInsert,
  ) {
    await tx.insert(schema.batchLineage).values(data);
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
