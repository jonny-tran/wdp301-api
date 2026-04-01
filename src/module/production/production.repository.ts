/**
 * Truy vấn lệnh sản xuất / FEFO / reservation.
 * Số lượng từ DB (numeric) nên được truyền sang service dưới dạng string
 * và được parse bằng `fromDbDecimal` trước khi so sánh.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, SQL } from 'drizzle-orm';
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
      with: {
        items: { with: { ingredient: true } },
        outputProduct: true,
      },
    });
  }

  async findRecipeDetail(recipeId: number) {
    return this.findRecipeWithItems(recipeId);
  }

  async listRecipesPaged(params: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  }) {
    const offset = (params.page - 1) * params.limit;
    const wheres: SQL[] = [];
    const search = params.search?.trim();
    if (search) {
      const p = `%${search}%`;
      const cond = or(
        ilike(schema.products.name, p),
        ilike(schema.recipes.name, p),
      );
      if (cond) wheres.push(cond);
    }
    if (params.isActive !== undefined) {
      wheres.push(eq(schema.recipes.isActive, params.isActive));
    }
    const whereClause = wheres.length ? and(...wheres) : undefined;

    const [countRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.recipes)
      .innerJoin(
        schema.products,
        eq(schema.recipes.outputProductId, schema.products.id),
      )
      .where(whereClause);

    const totalItems = Number(countRow?.c ?? 0);

    const rows = await this.db
      .select({
        id: schema.recipes.id,
        name: schema.recipes.name,
        outputProductId: schema.recipes.outputProductId,
        outputProductName: schema.products.name,
        outputProductSku: schema.products.sku,
        isActive: schema.recipes.isActive,
        createdAt: schema.recipes.createdAt,
      })
      .from(schema.recipes)
      .innerJoin(
        schema.products,
        eq(schema.recipes.outputProductId, schema.products.id),
      )
      .where(whereClause)
      .orderBy(desc(schema.recipes.id))
      .limit(params.limit)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    let ingredientCountMap = new Map<number, number>();
    if (ids.length > 0) {
      const countRows = await this.db
        .select({
          recipeId: schema.recipeItems.recipeId,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.recipeItems)
        .where(inArray(schema.recipeItems.recipeId, ids))
        .groupBy(schema.recipeItems.recipeId);
      ingredientCountMap = new Map(
        countRows.map((r) => [r.recipeId, Number(r.n)]),
      );
    }

    const items = rows.map((r) => ({
      ...r,
      ingredientCount: ingredientCountMap.get(r.id) ?? 0,
    }));

    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: params.limit,
        totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
        currentPage: params.page,
      },
    };
  }

  async countBlockingOrdersForRecipe(recipeId: number) {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.productionOrders)
      .where(
        and(
          eq(schema.productionOrders.recipeId, recipeId),
          inArray(schema.productionOrders.status, ['draft', 'in_progress']),
        ),
      );
    return Number(row?.c ?? 0);
  }

  async countOtherActiveRecipesForProduct(
    outputProductId: number,
    excludeRecipeId: number,
  ) {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.outputProductId, outputProductId),
          eq(schema.recipes.isActive, true),
          ne(schema.recipes.id, excludeRecipeId),
        ),
      );
    return Number(row?.c ?? 0);
  }

  async updateRecipe(
    recipeId: number,
    data: {
      outputProductId?: number;
      name?: string;
      isActive?: boolean;
      items?: { productId: number; quantity: string }[];
    },
  ) {
    return this.db.transaction(async (tx) => {
      const patch: Partial<typeof schema.recipes.$inferInsert> = {};
      if (data.outputProductId !== undefined) {
        patch.outputProductId = data.outputProductId;
      }
      if (data.name !== undefined) {
        patch.name = data.name;
      }
      if (data.isActive !== undefined) {
        patch.isActive = data.isActive;
      }
      if (Object.keys(patch).length > 0) {
        await tx
          .update(schema.recipes)
          .set(patch)
          .where(eq(schema.recipes.id, recipeId));
      }
      if (data.items) {
        await tx
          .delete(schema.recipeItems)
          .where(eq(schema.recipeItems.recipeId, recipeId));
        if (data.items.length > 0) {
          await tx.insert(schema.recipeItems).values(
            data.items.map((i) => ({
              recipeId,
              ingredientProductId: i.productId,
              quantityPerOutput: i.quantity,
            })),
          );
        }
      }
      return tx.query.recipes.findFirst({
        where: eq(schema.recipes.id, recipeId),
        with: {
          items: { with: { ingredient: true } },
          outputProduct: true,
        },
      });
    });
  }

  async listProductionOrdersPaged(params: {
    page: number;
    limit: number;
    status?: readonly string[];
  }) {
    const offset = (params.page - 1) * params.limit;
    const wheres: SQL[] = [];
    if (params.status?.length) {
      wheres.push(
        inArray(
          schema.productionOrders.status,
          params.status as ('draft' | 'in_progress' | 'completed' | 'cancelled')[],
        ),
      );
    }
    const whereClause = wheres.length ? and(...wheres) : undefined;

    const [countRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.productionOrders)
      .where(whereClause);

    const totalItems = Number(countRow?.c ?? 0);

    const rows = await this.db.query.productionOrders.findMany({
      ...(whereClause ? { where: whereClause } : {}),
      with: {
        recipe: { with: { outputProduct: true } },
        kitchenStaff: true,
        creator: true,
      },
      orderBy: desc(schema.productionOrders.createdAt),
      limit: params.limit,
      offset,
    });

    return {
      items: rows,
      meta: {
        totalItems,
        itemCount: rows.length,
        itemsPerPage: params.limit,
        totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
        currentPage: params.page,
      },
    };
  }

  async findProductionOrderDetailById(id: string) {
    return this.db.query.productionOrders.findFirst({
      where: eq(schema.productionOrders.id, id),
      with: {
        recipe: {
          with: {
            outputProduct: true,
            items: { with: { ingredient: true } },
          },
        },
        reservations: {
          with: {
            batch: { with: { product: true } },
          },
        },
        batchLineages: {
          with: {
            parentBatch: { with: { product: true } },
            childBatch: { with: { product: true } },
          },
        },
        creator: true,
        kitchenStaff: true,
      },
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
