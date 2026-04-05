import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  SQL,
  sql,
  lt,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  parseToEndOfDayVn,
  parseToStartOfDayVn,
} from '../../common/time/vn-time';
import { FilterMap } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import {
  invFromDb,
  invToDbString,
} from './utils/inventory-decimal.util';

@Injectable()
export class InventoryRepository {
  private readonly logger = new Logger(InventoryRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}
  async findWarehouseByStoreId(storeId: string) {
    const sid = String(storeId).trim();
    if (!sid) return undefined;
    return this.db.query.warehouses.findFirst({
      where: and(
        eq(schema.warehouses.storeId, sid),
        eq(schema.warehouses.type, 'store_internal'),
      ),
    });
  }

  /** Kho `central` gắn với `store_id` trong JWT (bếp trung tâm). */
  async findCentralWarehouseByStoreId(storeId: string) {
    const sid = String(storeId).trim();
    if (!sid) return undefined;
    return this.db.query.warehouses.findFirst({
      where: and(
        eq(schema.warehouses.storeId, sid),
        eq(schema.warehouses.type, 'central'),
      ),
    });
  }

  // Define Filter Maps
  private readonly storeInventoryFilterMap: FilterMap<typeof schema.inventory> =
    {
      // Note: search logic is complex (junctions), handled in manual where clause or advanced customization of paginate if needed.
      // paginate util simple filterMap handles direct column mapping or simple joins if flat.
      // Since search needs to look into joined Batch -> Product -> Name/Code,
      // standard paginate might need 'customWhere' or we manually build querybuilder then pass to paginate?
      // paginate receives 'table' and 'filterMap'. It builds basic where clauses.
      // For deep search (product name), we might need to use the returned query builder from paginate?
      // paginate returns `PaginatedResponse`. It executes the query.
      // If paginate doesn't support complex joins + search, we might need to manually implement pagination for this complex case
      // OR create a View?
      // RE-READING REQUIREMENT: "use paginate ... Create FilterMap for search (ilike name product)".
      // Drizzle's paginate util in this project seems to take a table and filterMap.
      // If table is schema.inventory, we can't easily filter by product name via simple FilterMap on 'inventory' table columns.
      // However, the current paginate implementation accepts 'table' and filters on columns of THAT table.
      // To filter by relation, we need to handle it.
      // The paginate util provided earlier:
      /*
      export async function paginate<T extends PgTable>(
        db: PgDatabase<any, any, any>,
        table: T,
        dto: PaginationParamsDto & Record<string, unknown>,
        filterMap?: FilterMap<T>,
      )...
    */
      // It filters based on `filterMap[key].column`. This column must belong to `table`.
      // So we cannot easily filter by Product Name using this specific utility on Inventory table directly.
      // BUT the requirement says: "getStoreInventory: Create FilterMap for search (ilike name product)".
      // This implies the user *thinks* it's possible or wants us to adapt.
      // Since we can't change the util deeply right now without risk, let's implement MANUAL pagination for getStoreInventory
      // to ensure deep filtering works, BUT return the STANDARD PaginatedResponse interface.
      // Wait, the instruction says "Uses paginate function ... for getStoreInventory".
      // If we MUST use it, we can only filter columns on `inventory` or we need to pass a subquery/view?
      // Let's stick to Requirements: "getInventorySummary ... manual pagination". "getStoreInventory ... paginate util".
      // Maybe I should use a join in the filterMap? "column: schema.products.name"?
      // The util uses `whereConditions.push(ilike(column, ...))`.
      // If we pass `schema.products.name` as column, Drizzle might complain if it's not in the 'from(table)' context?
      // Drizzle query builder is smart. If we use `db.select().from(inventory).innerJoin(products...)...` then `where(ilike(products.name...))` it works.
      // BUT `paginate` util does `db.select().from(table).where(...)`. It creates a fresh query on `table`. It doesn't join.
      // So we CANNOT use `paginate` helper for joined properties unless `paginate` is updated to support relations/joins.
      // Given the constraints and the goal (Standard Response), I will opt to implement MANUAL pagination for `getStoreInventory` to support Search properly,
      // ensuring it returns strict `PaginatedResponse`.
      // Actually, for `getStoreTransactions`, it IS on the main table (type, createdAt), so `paginate` works fine there.
      // Let's try to use `paginate` where possible, and manual where complex updates are needed, but keeping the signature standardized.
    };

  async getStoreInventory(warehouseId: number, query: GetStoreInventoryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(schema.inventory.warehouseId, warehouseId)];

    if (query.search) {
      // Search by Product Name or Batch Code
      conditions.push(
        or(
          ilike(schema.products.name, `%${query.search}%`),
          ilike(schema.batches.batchCode, `%${query.search}%`),
        )!,
      );
    }

    const whereCondition = and(...conditions)!;

    // Queries
    const data = await this.db
      .select({
        inventory: schema.inventory,
        batch: schema.batches,
        product: schema.products,
        baseUnit: schema.baseUnits,
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
      .leftJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(asc(schema.batches.expiryDate));

    const totalRaw = await this.db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(whereCondition);

    const totalItems = Number(totalRaw[0]?.count || 0);

    return {
      items: data.map((row) => ({
        ...row.inventory,
        batch: {
          ...row.batch,
          product: {
            ...row.product,
            baseUnit: row.baseUnit,
          },
        },
      })),
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  // Define Filter Map for Transactions
  private readonly transactionFilterMap: FilterMap<
    typeof schema.inventoryTransactions
  > = {
    type: { column: schema.inventoryTransactions.type, operator: 'eq' },
    fromDate: {
      column: schema.inventoryTransactions.createdAt,
      operator: 'gte',
    },
    toDate: { column: schema.inventoryTransactions.createdAt, operator: 'lte' },
  };

  async getStoreTransactions(
    warehouseId: number,
    query: GetInventoryTransactionsDto,
  ) {
    // We need to enforce warehouseId filter manually + DTO filters via paginate
    // paginate util allows extra where conditions? No, strictly filterMap.
    // But we can merge warehouseId into the query DTO for filtering if we map it?
    // OR we modify paginate util (risk).
    // Let's perform manual pagination here too to be safe and consistent with specific warehouse ID requirements + joins.
    // Wait, transactions need Product Name and Batch Code (Joined).
    // Paginate util won't join.
    // So Manual Pagination is the safest route for correct data, while matching Response Interface.

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(schema.inventoryTransactions.warehouseId, warehouseId),
    ];

    if (query.type) {
      conditions.push(eq(schema.inventoryTransactions.type, query.type));
    }
    if (query.fromDate) {
      conditions.push(
        gte(schema.inventoryTransactions.createdAt, new Date(query.fromDate)),
      );
    }
    if (query.toDate) {
      conditions.push(
        lte(schema.inventoryTransactions.createdAt, new Date(query.toDate)),
      );
    }

    const whereCondition = and(...conditions)!;

    const data = await this.db
      .select({
        tx: schema.inventoryTransactions,
        batch: schema.batches,
        product: schema.products,
      })
      .from(schema.inventoryTransactions)
      .innerJoin(
        schema.batches,
        eq(schema.inventoryTransactions.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.inventoryTransactions.createdAt));

    const totalRaw = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.inventoryTransactions)
      .where(whereCondition);

    const totalItems = Number(totalRaw[0]?.count || 0);

    return {
      items: data.map((row) => ({
        ...row.tx,
        batch: {
          ...row.batch,
          product: row.product,
        },
      })),
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
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
    type:
      | 'import'
      | 'export'
      | 'waste'
      | 'adjustment'
      | 'production_consume'
      | 'production_output'
      | 'reservation'
      | 'release'
      | 'adjust_loss'
      | 'adjust_surplus',
    quantityChange: number,
    referenceId?: string,
    reason?: string,
    tx?: NodePgDatabase<typeof schema>,
    opts?: {
      evidenceImage?: string | null;
      createdBy?: string | null;
    },
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
        evidenceImage: opts?.evidenceImage ?? undefined,
        createdBy: opts?.createdBy ?? undefined,
      })
      .returning();
    return transaction;
  }

  /** Đồng bộ physical / available / reserved trên bảng batches từ Σ inventory (Golden Equation). */
  async syncBatchTotalsFromInventory(
    tx: NodePgDatabase<typeof schema>,
    batchId: number,
  ) {
    const [agg] = await tx
      .select({
        p: sql<number>`coalesce(sum(${schema.inventory.quantity}::numeric), 0)::float8`.mapWith(
          Number,
        ),
        r: sql<number>`coalesce(sum(${schema.inventory.reservedQuantity}::numeric), 0)::float8`.mapWith(
          Number,
        ),
      })
      .from(schema.inventory)
      .where(eq(schema.inventory.batchId, batchId));

    const batchRow = await tx.query.batches.findFirst({
      where: eq(schema.batches.id, batchId),
    });

    const pDec = invFromDb(agg?.p ?? 0);
    const rDec = invFromDb(agg?.r ?? 0);
    let avail = pDec - rDec;
    if (batchRow?.status === 'expired') {
      avail = 0;
    }
    if (avail < 0) {
      avail = 0;
    }

    await tx
      .update(schema.batches)
      .set({
        physicalQuantity: invToDbString(pDec),
        reservedQuantity: invToDbString(rDec),
        availableQuantity: invToDbString(avail),
        updatedAt: new Date(),
      })
      .where(eq(schema.batches.id, batchId));
  }

  async findBatchesForFEFOWithShelfBuffer(
    productId: number,
    warehouseId: number,
    tx?: NodePgDatabase<typeof schema>,
    options?: { safetyMinimumExpiryDateStr?: string },
  ) {
    const database = tx || this.db;

    const expiryFilter = options?.safetyMinimumExpiryDateStr
      ? sql`${schema.batches.expiryDate}::date > ${options.safetyMinimumExpiryDateStr}::date`
      : sql`${schema.batches.expiryDate}::date > CURRENT_DATE + (COALESCE(${schema.products.minShelfLife}, 0)::int * interval '1 day')`;

    const base = database
      .select({
        inventoryId: schema.inventory.id,
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        quantity: schema.inventory.quantity,
        reservedQuantity: schema.inventory.reservedQuantity,
        unitCostAtImport: schema.batches.unitCostAtImport,
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
          expiryFilter,
          sql`${schema.batches.status}::text NOT IN ('expired', 'damaged', 'empty')`,
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));
    return tx ? base.for('update') : base;
  }

  /** Lô đủ điều kiện ATP: HSD (ngày) > mốc an toàn logistics (YYYY-MM-DD), FEFO */
  async findBatchesForAtpFefo(
    productId: number,
    warehouseId: number,
    safetyMinimumExpiryDateStr: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.findBatchesForFEFOWithShelfBuffer(
      productId,
      warehouseId,
      tx,
      { safetyMinimumExpiryDateStr },
    );
  }

  async reserveInventoryQuantity(
    inventoryId: number,
    quantityToReserve: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        reservedQuantity: sql`${schema.inventory.reservedQuantity}::numeric + ${String(quantityToReserve)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, inventoryId));
  }

  async findInventoryTransactionsByReferenceAndType(
    referenceId: string,
    type: 'reservation' | 'release',
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    return database.query.inventoryTransactions.findMany({
      where: and(
        eq(schema.inventoryTransactions.referenceId, referenceId),
        eq(schema.inventoryTransactions.type, type),
      ),
    });
  }

  /** Giao dịch kho gắn `reference_id` (ví dụ `PRODUCTION:{orderUuid}`). */
  async listTransactionsByReferenceId(referenceId: string) {
    return this.db.query.inventoryTransactions.findMany({
      where: eq(schema.inventoryTransactions.referenceId, referenceId),
      orderBy: asc(schema.inventoryTransactions.id),
      with: {
        batch: { with: { product: { with: { baseUnit: true } } } },
      },
    });
  }

  async listBatchesToExpire(tx?: NodePgDatabase<typeof schema>) {
    const database = tx || this.db;
    return database.query.batches.findMany({
      where: and(
        lte(schema.batches.expiryDate, sql<string>`CURRENT_DATE::date`),
        ne(schema.batches.status, 'expired'),
        ne(schema.batches.status, 'damaged'),
      ),
    });
  }

  async updateBatchStatus(
    tx: NodePgDatabase<typeof schema>,
    batchId: number,
    status: (typeof schema.batches.$inferSelect)['status'],
  ) {
    await tx
      .update(schema.batches)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.batches.id, batchId));
  }

  async clearReservedForBatchInventory(
    tx: NodePgDatabase<typeof schema>,
    batchId: number,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        reservedQuantity: '0',
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.batchId, batchId));
  }

  async decreasePhysicalAndReserved(
    warehouseId: number,
    batchId: number,
    amount: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    if (amount <= 0) return;
    await tx
      .update(schema.inventory)
      .set({
        quantity: sql`${schema.inventory.quantity}::numeric - ${String(amount)}::numeric`,
        reservedQuantity: sql`GREATEST(${schema.inventory.reservedQuantity}::numeric - ${String(amount)}::numeric, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, batchId),
        ),
      );
  }
  async getInventorySummary(
    filters: {
      warehouseId?: number;
      searchTerm?: string;
    },
    options: { limit?: number; offset?: number },
  ) {
    const conditions: SQL[] = [];

    if (filters.warehouseId) {
      conditions.push(eq(schema.inventory.warehouseId, filters.warehouseId));
    }

    if (filters.searchTerm) {
      conditions.push(ilike(schema.products.name, `%${filters.searchTerm}%`));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions)! : undefined;

    const summaryBase = this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        warehouseId: schema.inventory.warehouseId,
        warehouseName: schema.warehouses.name,
        totalQuantity: sql<number>`coalesce(sum(${schema.inventory.quantity}::numeric), 0)::float8`.mapWith(
          Number,
        ),
        unit: sql<string>`coalesce(${schema.baseUnits.name}, '')`,
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
      .leftJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      );

    const summaryFiltered = whereClause
      ? summaryBase.where(whereClause)
      : summaryBase;

    return summaryFiltered
      .groupBy(
        schema.products.id,
        schema.products.name,
        schema.products.sku,
        schema.baseUnits.name,
        schema.products.minStockLevel,
        schema.inventory.warehouseId,
        schema.warehouses.name,
      )
      .limit(options.limit || 20)
      .offset(options.offset || 0);
  }

  async getLowStockItems(warehouseId?: number) {
    const sqBase = this.db
      .select({
        productId: schema.batches.productId,
        totalQuantity: sql<number>`coalesce(sum(${schema.inventory.quantity}::numeric), 0)::float8`.as(
          'total_quantity',
        ),
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      );

    const sqFiltered =
      warehouseId != null
        ? sqBase.where(eq(schema.inventory.warehouseId, warehouseId))
        : sqBase;

    const sq = sqFiltered.groupBy(schema.batches.productId).as('sq');

    return this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        minStockLevel: schema.products.minStockLevel,
        currentQuantity: sql<number>`coalesce(${sq.totalQuantity}, 0)::float8`.mapWith(
          Number,
        ),
        unit: sql<string>`coalesce(${schema.baseUnits.name}, '')`,
      })
      .from(schema.products)
      .leftJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .leftJoin(sq, eq(schema.products.id, sq.productId))
      .where(
        lte(
          sql`coalesce(${sq.totalQuantity}, 0)::numeric`,
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

  //// Helper: Tìm ID của Kho Trung Tâm (Central Kitchen)
  async findCentralWarehouseId() {
    const warehouse = await this.db.query.warehouses.findFirst({
      where: eq(schema.warehouses.type, 'central'),
    });
    return warehouse?.id;
  }

  /**
   * Xác định kho bếp cho ngữ cảnh JWT:
   * - Có `storeId`: warehouse `central` gắn store đó.
   * - Không khớp / không có store: chọn kho `central` có **nhiều dòng inventory nhất** (tránh lệch khi có nhiều kho central).
   */
  async resolveCentralKitchenWarehouseId(
    storeId: string | null | undefined,
  ): Promise<number | null> {
    const sid =
      storeId != null && String(storeId).trim() !== ''
        ? String(storeId).trim()
        : null;

    if (sid) {
      const linked = await this.findCentralWarehouseByStoreId(sid);
      if (linked) {
        this.logger.debug(
          `[resolveCentralKitchen] store-linked central warehouseId=${linked.id} storeId=${sid}`,
        );
        return linked.id;
      }
    }

    /** Hub chung: `central` không gắn store (dữ liệu seed / bếp đơn). */
    const globalCentral = await this.db.query.warehouses.findFirst({
      where: and(
        eq(schema.warehouses.type, 'central'),
        isNull(schema.warehouses.storeId),
      ),
      orderBy: asc(schema.warehouses.id),
    });
    if (globalCentral) {
      this.logger.debug(
        `[resolveCentralKitchen] global central (store_id null) warehouseId=${globalCentral.id}`,
      );
      return globalCentral.id;
    }

    const centrals = await this.db.query.warehouses.findMany({
      where: eq(schema.warehouses.type, 'central'),
      orderBy: asc(schema.warehouses.id),
    });
    if (centrals.length === 0) {
      this.logger.warn('[resolveCentralKitchen] no central warehouse rows');
      return null;
    }
    if (centrals.length === 1) {
      this.logger.debug(
        `[resolveCentralKitchen] single central warehouseId=${centrals[0].id}`,
      );
      return centrals[0].id;
    }
    const counts = await Promise.all(
      centrals.map(async (w) => {
        const [row] = await this.db
          .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
          .from(schema.inventory)
          .where(eq(schema.inventory.warehouseId, w.id));
        return { id: w.id, n: Number(row?.n ?? 0) };
      }),
    );
    counts.sort((a, b) => b.n - a.n || a.id - b.id);
    const picked = counts[0].id;
    this.logger.debug(
      `[resolveCentralKitchen] picked central with most inventory rows warehouseId=${picked}`,
    );
    return picked;
  }

  /**
   * Tổng quan bếp: FROM products LEFT JOIN tổng tồn theo warehouse (SKU hết vẫn hiện với 0).
   */
  async getKitchenSummary(
    warehouseId: number,
    options: { search?: string; limit?: number; offset?: number },
  ) {
    const searchTerm = options.search?.trim();
    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const page = Math.floor(offset / limit) + 1;

    const searchCondition = searchTerm
      ? or(
          ilike(schema.products.name, `%${searchTerm}%`),
          ilike(schema.products.sku, `%${searchTerm}%`),
        )
      : undefined;

    const productFilter = and(
      eq(schema.products.isActive, true),
      searchCondition,
    );

    const invAgg = this.db
      .select({
        productId: schema.batches.productId,
        totalPhysical: sql`coalesce(sum(${schema.inventory.quantity}::numeric), 0)::float8`.as(
          'totalPhysical',
        ),
        totalReserved: sql`coalesce(sum(${schema.inventory.reservedQuantity}::numeric), 0)::float8`.as(
          'totalReserved',
        ),
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(eq(schema.inventory.warehouseId, warehouseId))
      .groupBy(schema.batches.productId)
      .as('inv_agg');

    const data = await this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        unitName: sql<string>`coalesce(${schema.baseUnits.name}, '')`,
        minStock: schema.products.minStockLevel,
        totalPhysical: sql<number>`coalesce(${invAgg.totalPhysical}::numeric, 0)::float8`.mapWith(
          Number,
        ),
        totalReserved: sql<number>`coalesce(${invAgg.totalReserved}::numeric, 0)::float8`.mapWith(
          Number,
        ),
      })
      .from(schema.products)
      .leftJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .leftJoin(invAgg, eq(schema.products.id, invAgg.productId))
      .where(productFilter)
      .orderBy(asc(schema.products.name))
      .limit(limit)
      .offset(offset);

    const totalRaw = await this.db
      .select({
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(schema.products)
      .leftJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(productFilter);

    const totalItems = Number(totalRaw[0]?.count || 0);

    this.logger.debug(
      `[getKitchenSummary] warehouseId=${warehouseId} limit=${limit} offset=${offset} rowCount=${data.length} totalItems=${totalItems} sample=${JSON.stringify(data[0] ?? null)}`,
    );

    return {
      items: data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  /**
   * Drill-down lô theo sản phẩm tại một warehouse: từ `batches` LEFT JOIN `inventory`
   * (chỉ dòng inventory của đúng kho). Khớp macro summary: sản phẩm tồn 0 vẫn thấy các lô (0/0).
   */
  async getKitchenBatchDetails(warehouseId: number, productId: number) {
    return await this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        quantity: sql<string>`coalesce(${schema.inventory.quantity}::text, '0')`,
        reserved: sql<string>`coalesce(${schema.inventory.reservedQuantity}::text, '0')`,
      })
      .from(schema.batches)
      .leftJoin(
        schema.inventory,
        and(
          eq(schema.inventory.batchId, schema.batches.id),
          eq(schema.inventory.warehouseId, warehouseId),
        ),
      )
      .where(eq(schema.batches.productId, productId))
      .orderBy(asc(schema.batches.expiryDate));
  }

  /** Product có ít nhất một lô trong kho với HSD trong [today, today+withinDays]. */
  async getProductIdsNearExpiryAlert(
    warehouseId: number,
    productIds: number[],
    withinDays: number,
  ): Promise<Set<number>> {
    if (productIds.length === 0) {
      return new Set();
    }
    const until = new Date();
    until.setDate(until.getDate() + withinDays);
    const untilStr = until.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const rows = await this.db
      .selectDistinct({ productId: schema.batches.productId })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          inArray(schema.batches.productId, productIds),
          lte(schema.batches.expiryDate, untilStr),
          gte(schema.batches.expiryDate, todayStr),
          or(
            gt(schema.inventory.quantity, '0'),
            gt(schema.inventory.reservedQuantity, '0'),
          ),
        ),
      );

    return new Set(rows.map((r) => r.productId));
  }

  /**
   * Chi tiết lô theo sản phẩm — FEFO (HSD ASC). Từ `batches` LEFT JOIN `inventory` đúng kho:
   * lô chưa có dòng tồn / tồn 0 vẫn hiển thị; lô hết hạn vẫn có trong danh sách (status từ service).
   */
  async getKitchenProductBatchesFefo(warehouseId: number, productId: number) {
    const rows = await this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        batchStatus: schema.batches.status,
        physicalQty: sql<string>`coalesce(${schema.inventory.quantity}::text, '0')`,
        reservedQty: sql<string>`coalesce(${schema.inventory.reservedQuantity}::text, '0')`,
        minShelfLife: schema.products.minShelfLife,
      })
      .from(schema.batches)
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .leftJoin(
        schema.inventory,
        and(
          eq(schema.inventory.batchId, schema.batches.id),
          eq(schema.inventory.warehouseId, warehouseId),
        ),
      )
      .where(eq(schema.batches.productId, productId))
      .orderBy(asc(schema.batches.expiryDate));

    this.logger.debug(
      `[getKitchenProductBatchesFefo] warehouseId=${warehouseId} productId=${productId} batchLines=${rows.length}`,
    );

    return rows;
  }

  async lockInventoryRowForUpdate(
    warehouseId: number,
    batchId: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    const [row] = await tx
      .select()
      .from(schema.inventory)
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, batchId),
        ),
      )
      .for('update');
    return row ?? null;
  }

  async updateInventoryPhysicalOnly(
    inventoryId: number,
    newQuantityDb: string,
    tx: NodePgDatabase<typeof schema>,
  ) {
    await tx
      .update(schema.inventory)
      .set({
        quantity: newQuantityDb,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, inventoryId));
  }

  /** Lịch sử giao dịch một kho (bếp) + optional batchId, kèm tên nhân viên. */
  async getWarehouseInventoryTransactions(
    warehouseId: number,
    query: GetInventoryTransactionsDto,
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(schema.inventoryTransactions.warehouseId, warehouseId),
    ];

    if (query.batchId != null) {
      conditions.push(
        eq(schema.inventoryTransactions.batchId, Number(query.batchId)),
      );
    }
    if (query.type) {
      conditions.push(eq(schema.inventoryTransactions.type, query.type));
    }
    if (query.fromDate) {
      conditions.push(
        gte(
          schema.inventoryTransactions.createdAt,
          parseToStartOfDayVn(query.fromDate).toDate(),
        ),
      );
    }
    if (query.toDate) {
      conditions.push(
        lte(
          schema.inventoryTransactions.createdAt,
          parseToEndOfDayVn(query.toDate).toDate(),
        ),
      );
    }

    const whereCondition = and(...conditions)!;

    this.logger.debug(
      `[InventoryTx] warehouseId=${warehouseId} batchId=${query.batchId ?? 'all'} type=${query.type ?? 'all'}`,
    );

    const data = await this.db
      .select({
        id: schema.inventoryTransactions.id,
        createdAt: schema.inventoryTransactions.createdAt,
        type: schema.inventoryTransactions.type,
        quantityChange: schema.inventoryTransactions.quantityChange,
        reason: schema.inventoryTransactions.reason,
        referenceId: schema.inventoryTransactions.referenceId,
        batchCode: schema.batches.batchCode,
        staffUsername: schema.users.username,
        staffEmail: schema.users.email,
      })
      .from(schema.inventoryTransactions)
      .innerJoin(
        schema.batches,
        eq(schema.inventoryTransactions.batchId, schema.batches.id),
      )
      .leftJoin(
        schema.users,
        eq(schema.inventoryTransactions.createdBy, schema.users.id),
      )
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.inventoryTransactions.createdAt));

    const totalRaw = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.inventoryTransactions)
      .where(whereCondition);

    const totalItems = Number(totalRaw[0]?.count || 0);

    return {
      items: data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async getAnalyticsSummary(warehouseId: number) {
    const invAgg = this.db
      .select({
        productId: schema.batches.productId,
        totalPhysical: sql`coalesce(sum(${schema.inventory.quantity}::numeric), 0)::float8`.as(
          'totalPhysical',
        ),
        totalReserved: sql`coalesce(sum(${schema.inventory.reservedQuantity}::numeric), 0)::float8`.as(
          'totalReserved',
        ),
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(eq(schema.inventory.warehouseId, warehouseId))
      .groupBy(schema.batches.productId)
      .as('inv_agg_analytics');

    const inventoryQuery = this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        minStock: schema.products.minStockLevel,
        totalPhysical: sql<number>`coalesce(${invAgg.totalPhysical}::numeric, 0)::float8`.mapWith(
          Number,
        ),
        totalReserved: sql<number>`coalesce(${invAgg.totalReserved}::numeric, 0)::float8`.mapWith(
          Number,
        ),
      })
      .from(schema.products)
      .leftJoin(invAgg, eq(schema.products.id, invAgg.productId))
      .where(eq(schema.products.isActive, true));

    const expiredAlertQuery = this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        quantity: schema.inventory.quantity,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          sql`${schema.batches.expiryDate}::date <= (CURRENT_DATE + interval '3 days')::date`,
          sql`${schema.batches.expiryDate}::date >= CURRENT_DATE::date`,
          or(
            gt(schema.inventory.quantity, '0'),
            gt(schema.inventory.reservedQuantity, '0'),
          ),
        ),
      );

    const [inventoryData, expiredBatches] = await Promise.all([
      inventoryQuery,
      expiredAlertQuery,
    ]);

    return { inventoryData, expiredBatches };
  }

  // --- API 2: Aging Report ---
  async getAgingReport(warehouseId: number) {
    return this.db
      .select({
        batchCode: schema.batches.batchCode,
        productName: schema.products.name,
        quantity: schema.inventory.quantity,
        expiryDate: schema.batches.expiryDate,
        shelfLifeDays: schema.products.shelfLifeDays,
        // Calculate created date approximation if not stored accurately,
        // but here we just need to know how much time is left vs total shelf life.
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
          gt(schema.inventory.quantity, '0'),
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));
  }

  // --- API 3: Waste Report ---
  async getWasteReport(
    warehouseId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    const wasteLike = or(
      eq(schema.inventoryTransactions.type, 'waste'),
      eq(schema.inventoryTransactions.type, 'adjust_loss'),
      and(
        eq(schema.inventoryTransactions.type, 'adjustment'),
        sql`${schema.inventoryTransactions.quantityChange}::numeric < 0`,
      ),
    );

    const conditions: SQL[] = [
      eq(schema.inventoryTransactions.warehouseId, warehouseId),
      wasteLike!,
    ];

    if (fromDate) {
      conditions.push(
        gte(
          schema.inventoryTransactions.createdAt,
          parseToStartOfDayVn(fromDate).toDate(),
        ),
      );
    }
    if (toDate) {
      conditions.push(
        lte(
          schema.inventoryTransactions.createdAt,
          parseToEndOfDayVn(toDate).toDate(),
        ),
      );
    }

    return this.db
      .select({
        transactionId: schema.inventoryTransactions.id,
        quantityWasted: schema.inventoryTransactions.quantityChange,
        reason: schema.inventoryTransactions.reason,
        createdAt: schema.inventoryTransactions.createdAt,
        productName: schema.products.name,
        batchCode: schema.batches.batchCode,
      })
      .from(schema.inventoryTransactions)
      .innerJoin(
        schema.batches,
        eq(schema.inventoryTransactions.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(and(...conditions))
      .orderBy(asc(schema.inventoryTransactions.createdAt));
  }

  // --- Financial Loss Impact ---
  async getFinancialLoss(
    from?: string,
    to?: string,
    kitchenWarehouseId?: number,
  ) {
    const wasteLike = or(
      eq(schema.inventoryTransactions.type, 'waste'),
      eq(schema.inventoryTransactions.type, 'adjust_loss'),
      and(
        eq(schema.inventoryTransactions.type, 'adjustment'),
        sql`${schema.inventoryTransactions.quantityChange}::numeric < 0`,
      ),
    );

    const invConditions: SQL[] = [wasteLike!];

    if (kitchenWarehouseId != null) {
      invConditions.push(
        eq(schema.inventoryTransactions.warehouseId, kitchenWarehouseId),
      );
    }

    const claimConditions: SQL[] = [];

    if (from) {
      const fromD = parseToStartOfDayVn(from).toDate();
      invConditions.push(gte(schema.inventoryTransactions.createdAt, fromD));
      claimConditions.push(gte(schema.claims.createdAt, fromD));
    }
    if (to) {
      const toD = parseToEndOfDayVn(to).toDate();
      invConditions.push(lte(schema.inventoryTransactions.createdAt, toD));
      claimConditions.push(lte(schema.claims.createdAt, toD));
    }

    // 1. Hàng hủy tại bếp (Từ bảng Bất biến: InventoryTransactions)
    const wasteQuery = this.db
      .select({
        productId: schema.batches.productId,
        productName: schema.products.name,
        totalWaste: sql<number>`CAST(SUM(ABS(${schema.inventoryTransactions.quantityChange})) AS FLOAT)`,
      })
      .from(schema.inventoryTransactions)
      .innerJoin(
        schema.batches,
        eq(schema.inventoryTransactions.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(and(...invConditions))
      .groupBy(schema.batches.productId, schema.products.name);

    // 2. Hàng hỏng tại kho cửa hàng (Từ Claims)
    const claimQuery = this.db
      .select({
        productId: schema.claimItems.productId,
        productName: schema.products.name,
        totalDamaged: sql<number>`CAST(SUM(${schema.claimItems.quantityDamaged}) AS FLOAT)`,
      })
      .from(schema.claimItems)
      .innerJoin(schema.claims, eq(schema.claimItems.claimId, schema.claims.id))
      .innerJoin(
        schema.products,
        eq(schema.claimItems.productId, schema.products.id),
      )
      .where(claimConditions.length > 0 ? and(...claimConditions) : undefined)
      .groupBy(schema.claimItems.productId, schema.products.name);

    const [wasteData, claimData] = await Promise.all([wasteQuery, claimQuery]);
    return { wasteData, claimData };
  }
}
