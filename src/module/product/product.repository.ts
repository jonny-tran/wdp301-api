import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  PaginationParamsDto,
  SortOrder,
} from 'src/common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { CreateProductDto } from './dto/create-product.dto';
import { GetBatchesDto } from './dto/get-batches.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly productFilterMap: FilterMap<typeof schema.products> = {
    search: {
      column: [schema.products.name, schema.products.sku],
      operator: 'ilike',
    },
    isActive: { column: schema.products.isActive, operator: 'eq' },
  };

  private readonly batchFilterMap: FilterMap<typeof schema.batches> = {
    productId: { column: schema.batches.productId, operator: 'eq' },
    fromDate: { column: schema.batches.expiryDate, operator: 'gte' },
    toDate: { column: schema.batches.expiryDate, operator: 'lte' },
  };

  async create(data: CreateProductDto & { sku: string }) {
    const [inserted] = await this.db
      .insert(schema.products)
      .values(data)
      .returning();

    // Return with baseUnitName
    return await this.findById(inserted.id);
  }

  async update(id: number, data: UpdateProductDto) {
    await this.db
      .update(schema.products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.products.id, id))
      .returning();

    // Return with baseUnitName
    return await this.findById(id);
  }

  async softDelete(id: number) {
    const [result] = await this.db
      .update(schema.products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.products.id, id))
      .returning();
    return result;
  }

  async findById(id: number) {
    const result = await this.db
      .select({
        id: schema.products.id,
        sku: schema.products.sku,
        name: schema.products.name,
        baseUnitName: schema.baseUnits.name,
        shelfLifeDays: schema.products.shelfLifeDays,
        minStockLevel: schema.products.minStockLevel,
        imageUrl: schema.products.imageUrl,
        isActive: schema.products.isActive,
        createdAt: schema.products.createdAt,
        updatedAt: schema.products.updatedAt,
      })
      .from(schema.products)
      .innerJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(eq(schema.products.id, id));

    return result[0];
  }

  async findOneWithBatches(id: number) {
    // Cannot easily mix db.select (flat) with existing relation object structure for batches.
    // But requirement says "include baseUnitName in all responses".
    // I'll fetch product details with innerJoin, and fetch batches separately or aggregately if needed.
    // Or I can use db.query and map it.
    // BUT strict requirement: "Use innerJoin".
    // I will use db.select for the product part.
    // For batches, I'll let findById handle the product part, but this method is "findOneWithBatches".
    // I'll stick to db.query for this one OR manual join.
    // db.query is much cleaner for relations.
    // If I MUST use innerJoin to get "baseUnitName" column specifically...
    // I will use db.query()...with: { baseUnit: true } and map it in Service or here.
    // "Update Repository: Use innerJoin ... to include baseUnitName".
    // I will rewrite this to use db.select with join to baseUnits, and leftJoin batch?
    // Complex.
    // Let's stick to existing "findFirst" with "with" but add "baseUnit".
    // WAIT, strict rule: "Use innerJoin".
    // I will rewrite findById to use innerJoin as shown above.
    // For findOneWithBatches, I'll use query builder with relations if possible, or manual join.
    // I'll use db.query for findOneWithBatches and add baseUnit relation, then flatten it?
    // "Update Repository: Use innerJoin with baseUnits table".
    // I will do:
    const product = await this.findById(id);
    if (!product) return null;

    // Fetch batches
    const batchesData = await this.db.query.batches.findMany({
      where: eq(schema.batches.productId, id),
    });

    return { ...product, batches: batchesData };
  }

  async findBySku(sku: string) {
    const result = await this.db
      .select({
        id: schema.products.id,
        sku: schema.products.sku,
        name: schema.products.name,
        baseUnitId: schema.products.baseUnitId,
        baseUnitName: schema.baseUnits.name,
        shelfLifeDays: schema.products.shelfLifeDays,
        minStockLevel: schema.products.minStockLevel,
        imageUrl: schema.products.imageUrl,
        isActive: schema.products.isActive,
        createdAt: schema.products.createdAt,
        updatedAt: schema.products.updatedAt,
      })
      .from(schema.products)
      .innerJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(eq(schema.products.sku, sku));

    return result[0];
  }

  async findAll(filter: GetProductsDto) {
    const { items, meta } = await paginate(
      this.db,
      schema.products,
      filter as PaginationParamsDto & Record<string, unknown>,
      this.productFilterMap,
    );

    // Enrich with baseUnitName
    const baseUnitIds = [...new Set(items.map((p) => p.baseUnitId))];
    const baseUnitsMap = new Map<number, string>();

    if (baseUnitIds.length > 0) {
      const units = await this.db
        .select({ id: schema.baseUnits.id, name: schema.baseUnits.name })
        .from(schema.baseUnits)
        .where(inArray(schema.baseUnits.id, baseUnitIds));
      units.forEach((u) => baseUnitsMap.set(u.id, u.name));
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      baseUnitName: baseUnitsMap.get(item.baseUnitId) || null,
    }));

    return { items: enrichedItems, meta };
  }

  async findAllInactive() {
    return await this.db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        shelfLifeDays: schema.products.shelfLifeDays,
        imageUrl: schema.products.imageUrl,
        isActive: schema.products.isActive,
        baseUnitName: schema.baseUnits.name,
      })
      .from(schema.products)
      .innerJoin(
        schema.baseUnits,
        eq(schema.products.baseUnitId, schema.baseUnits.id),
      )
      .where(eq(schema.products.isActive, false))
      .orderBy(desc(schema.products.updatedAt));
  }

  async restore(id: number) {
    const [result] = await this.db
      .update(schema.products)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(schema.products.id, id))
      .returning();
    return result;
  }

  // --- Batch Methods ---

  async findBatchById(id: number) {
    const result = await this.db
      .select({
        id: schema.batches.id,
        batchCode: schema.batches.batchCode,
        batchStatus: schema.batches.status,
        productId: schema.batches.productId,
        expiryDate: schema.batches.expiryDate,
        imageUrl: schema.batches.imageUrl,
        createdAt: schema.batches.createdAt,
        updatedAt: schema.batches.updatedAt,
        currentQuantity: schema.inventory.quantity,
      })
      .from(schema.batches)
      .leftJoin(
        schema.inventory,
        eq(schema.batches.id, schema.inventory.batchId),
      )
      .where(eq(schema.batches.id, id))
      .limit(1);

    if (!result.length) return null;
    return result[0];
  }

  async updateBatch(
    id: number,
    data: UpdateBatchDto,
    centralWarehouseId?: number,
  ) {
    return await this.db.transaction(async (tx) => {
      const [updatedBatch] = await tx
        .update(schema.batches)
        .set({
          imageUrl: data.imageUrl,
          status: data.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.batches.id, id))
        .returning();

      if (!updatedBatch) {
        throw new Error('Batch not found');
      }

      if (data.initialQuantity !== undefined && centralWarehouseId) {
        // Validate quantity > 0 handled by DTO Min(1)

        // Update Inventory
        await tx
          .insert(schema.inventory)
          .values({
            batchId: id,
            warehouseId: centralWarehouseId,
            quantity: data.initialQuantity.toString(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.inventory.batchId, schema.inventory.warehouseId],
            set: {
              quantity: data.initialQuantity.toString(),
              updatedAt: new Date(),
            },
          });

        // Record Transaction
        await tx.insert(schema.inventoryTransactions).values({
          warehouseId: centralWarehouseId,
          batchId: id,
          type: 'adjustment',
          quantityChange: data.initialQuantity.toString(),
          reason: 'Cập nhật số lượng ban đầu do nhập sai',
        });
      }

      return await this.findBatchById(updatedBatch.id);
    });
  }

  async findAllBatches(filter: GetBatchesDto) {
    const {
      page = 1,
      limit = 10,
      search,
      productId,
      fromDate,
      toDate,
      sortBy = 'expiryDate',
      sortOrder = SortOrder.ASC,
    } = filter;

    const offset = (Number(page) - 1) * Number(limit);
    const isPaginationDisabled = !filter.limit;

    const conditions: SQL[] = [];

    if (productId) {
      conditions.push(eq(schema.batches.productId, productId));
    }

    if (fromDate) {
      conditions.push(gte(schema.batches.expiryDate, fromDate));
    }

    if (toDate) {
      conditions.push(lte(schema.batches.expiryDate, toDate));
    }

    if (search) {
      const searchCondition = or(
        sql`${schema.batches.batchCode} ILIKE ${'%' + search + '%'}`,
        sql`${schema.products.name} ILIKE ${'%' + search + '%'}`,
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    let orderByCol: SQL | undefined;
    if (sortBy === 'createdAt') {
      orderByCol =
        sortOrder === SortOrder.ASC
          ? asc(schema.batches.createdAt)
          : desc(schema.batches.createdAt);
    } else {
      orderByCol =
        sortOrder === SortOrder.ASC
          ? asc(schema.batches.expiryDate)
          : desc(schema.batches.expiryDate);
    }

    const baseQuery = this.db
      .select({
        batches: schema.batches,
        productName: schema.products.name,
      })
      .from(schema.batches)
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(whereCondition)
      .orderBy(orderByCol);

    const itemsQuery = isPaginationDisabled
      ? baseQuery
      : baseQuery.limit(Number(limit)).offset(offset);

    const [totalResult, itemsData] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.batches)
        .innerJoin(
          schema.products,
          eq(schema.batches.productId, schema.products.id),
        )
        .where(whereCondition),
      itemsQuery,
    ]);

    const totalItems = Number(totalResult[0]?.count || 0);

    const items = itemsData.map((row) => ({
      ...row.batches,
      productName: row.productName,
    }));

    // Enrich with currentQuantity
    const batchIds = items.map((b) => b.id);
    const quantityMap = new Map<number, number>();

    if (batchIds.length > 0) {
      const quantities = await this.db
        .select({
          batchId: schema.inventory.batchId,
          total: sql<number>`sum(${schema.inventory.quantity})`,
        })
        .from(schema.inventory)
        .where(inArray(schema.inventory.batchId, batchIds))
        .groupBy(schema.inventory.batchId);

      quantities.forEach((q) => quantityMap.set(q.batchId, Number(q.total)));
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      currentQuantity: quantityMap.get(item.id)?.toString() || '0',
    }));

    return {
      items: enrichedItems,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: isPaginationDisabled ? totalItems : Number(limit),
        totalPages: isPaginationDisabled
          ? 1
          : Math.ceil(totalItems / (Number(limit) || 1)),
        currentPage: isPaginationDisabled ? 1 : Number(page),
      },
    };
  }

  async createBatch(data: {
    productId: number;
    batchCode: string;
    expiryDate: string;
    imageUrl?: string;
  }) {
    const [batch] = await this.db
      .insert(schema.batches)
      .values({
        productId: data.productId,
        batchCode: data.batchCode,
        expiryDate: data.expiryDate,
        imageUrl: data.imageUrl,
        status: 'pending',
      })
      .returning();
    return batch;
  }

  async createBatchWithInventory(
    batchData: {
      productId: number;
      batchCode: string;
      expiryDate: string;
      imageUrl?: string;
    },
    inventoryData: { warehouseId: number; initialQuantity: number },
  ) {
    return await this.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(schema.batches)
        .values({
          productId: batchData.productId,
          batchCode: batchData.batchCode,
          expiryDate: batchData.expiryDate,
          imageUrl: batchData.imageUrl,
        })
        .returning();

      const initialQtyStr = inventoryData.initialQuantity.toString();

      await tx.insert(schema.inventory).values({
        warehouseId: inventoryData.warehouseId,
        batchId: batch.id,
        quantity: initialQtyStr,
        reservedQuantity: '0',
      });

      await tx.insert(schema.inventoryTransactions).values({
        warehouseId: inventoryData.warehouseId,
        batchId: batch.id,
        type: 'import',
        quantityChange: initialQtyStr,
        reason: 'Initial Batch Creation',
        referenceId: `BATCH-${batch.batchCode}`,
      });

      return batch;
    });
  }

  async findCentralWarehouseId() {
    const res = await this.db
      .select()
      .from(schema.warehouses)
      .where(eq(schema.warehouses.type, 'central'))
      .limit(1);
    return res[0]?.id;
  }
}
