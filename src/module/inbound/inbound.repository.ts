import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gte,
  ilike,
  InferSelectModel,
  lte,
  or,
  SQL,
  sql,
} from 'drizzle-orm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { VN_TZ } from '../../common/time/vn-time';

dayjs.extend(utc);
dayjs.extend(timezone);
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { GetReceiptsDto } from './dto/get-receipts.dto';

/** Client DB hoặc trong transaction (cùng API Drizzle) */
type DbOrTx = NodePgDatabase<typeof schema>;

@Injectable()
export class InboundRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // API 1: Tạo phiếu
  async createReceipt(data: typeof schema.receipts.$inferInsert) {
    const [receipt] = await this.db
      .insert(schema.receipts)
      .values(data)
      .returning();
    return receipt;
  }

  async findReceiptById(id: string) {
    return this.db.query.receipts.findFirst({
      where: eq(schema.receipts.id, id),
    });
  }

  // Khóa bản ghi Receipt để xử lý (Atomic Lock)
  async findReceiptWithLock(
    tx: DbOrTx,
    id: string,
  ): Promise<InferSelectModel<typeof schema.receipts> | undefined> {
    const [receipt] = await tx
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .for('update'); // Row-level Lock
    return receipt;
  }

  // Cập nhật trạng thái Receipt
  async updateReceiptStatus(tx: DbOrTx, id: string, status: 'completed') {
    await tx
      .update(schema.receipts)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.receipts.id, id));
  }

  // Cập nhật trạng thái Batch
  async updateBatchStatus(
    tx: DbOrTx,
    batchId: number,
    status: 'available',
  ) {
    await tx
      .update(schema.batches)
      .set({ status })
      .where(eq(schema.batches.id, batchId));
  }

  // Upsert tồn kho (Quan trọng: Dùng CAST để tránh cộng chuỗi)
  async upsertInventory(
    tx: DbOrTx,
    warehouseId: number,
    batchId: number,
    quantity: string,
  ) {
    await tx
      .insert(schema.inventory)
      .values({
        warehouseId,
        batchId,
        quantity,
        reservedQuantity: '0',
      })
      .onConflictDoUpdate({
        target: [schema.inventory.warehouseId, schema.inventory.batchId],
        set: {
          // quantity = inventory.quantity + CAST(new_quantity AS DECIMAL)
          quantity: sql`${schema.inventory.quantity} + CAST(${quantity} AS DECIMAL)`,
          updatedAt: new Date(),
        },
      });
  }

  // Ghi log giao dịch kho
  async insertInventoryTransaction(
    tx: DbOrTx,
    data: {
      warehouseId: number;
      batchId: number;
      quantityChange: string;
      referenceId: string;
      reason?: string;
    },
  ) {
    await tx.insert(schema.inventoryTransactions).values({
      warehouseId: data.warehouseId,
      batchId: data.batchId,
      type: 'import',
      quantityChange: data.quantityChange,
      referenceId: data.referenceId,
      reason: data.reason ?? 'Inbound Receipt Completed',
    });
  }

  /** Khóa logic sinh mã lô (tránh trùng khi đồng thời) */
  async lockBatchCodeGeneration(tx: DbOrTx) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(871002, 1)`);
  }

  /** Khóa kho theo warehouse khi cộng tồn (tránh race) */
  async lockWarehouseStock(tx: DbOrTx, warehouseId: number) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(90210, ${warehouseId})`);
  }

  sanitizeSkuForBatchCode(sku: string): string {
    const s = sku.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return s.length > 0 ? s.slice(0, 32) : 'X';
  }

  /** Định dạng BAT-YYYYMMDD-SKU-XXXX (XXXX tăng trong ngày + SKU, múi giờ VN) */
  async nextBatchCode(tx: DbOrTx, sku: string): Promise<string> {
    await this.lockBatchCodeGeneration(tx);
    const dayStr = dayjs().tz(VN_TZ).format('YYYYMMDD');
    const skuPart = this.sanitizeSkuForBatchCode(sku);
    const prefix = `BAT-${dayStr}-${skuPart}-`;
    const likePattern = `${prefix}%`;
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.batches)
      .where(sql`${schema.batches.batchCode} like ${likePattern}`);
    const next = (row?.n ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async insertBatch(
    tx: DbOrTx,
    data: {
      productId: number;
      batchCode: string;
      manufacturedDate: string;
      expiryDate: string;
    },
  ) {
    const [batch] = await tx
      .insert(schema.batches)
      .values({
        productId: data.productId,
        batchCode: data.batchCode,
        manufacturedDate: data.manufacturedDate,
        expiryDate: data.expiryDate,
        status: 'pending',
      })
      .returning();
    return batch;
  }

  async updateReceiptItemBatchLink(
    tx: DbOrTx,
    itemId: number,
    batchId: number,
  ) {
    await tx
      .update(schema.receiptItems)
      .set({ batchId })
      .where(eq(schema.receiptItems.id, itemId));
  }

  async addReceiptItemLine(
    data: {
      receiptId: string;
      productId: number;
      quantityLine: string;
      quantityAccepted: string;
      quantityRejected: string;
      rejectionReason: string | null;
      expectedQuantity: string | null;
      storageLocationCode: string | null;
      manufacturedDate: string;
      statedExpiryDate: string | null;
    },
    tx?: DbOrTx,
  ) {
    const runner = tx ?? this.db;
    const [item] = await runner
      .insert(schema.receiptItems)
      .values({
        receiptId: data.receiptId,
        productId: data.productId,
        batchId: null,
        quantity: data.quantityLine,
        quantityAccepted: data.quantityAccepted,
        quantityRejected: data.quantityRejected,
        rejectionReason: data.rejectionReason,
        expectedQuantity: data.expectedQuantity,
        storageLocationCode: data.storageLocationCode,
        manufacturedDate: data.manufacturedDate,
        statedExpiryDate: data.statedExpiryDate,
      })
      .returning();
    return item;
  }

  // Helper: Lấy items của receipt
  async getReceiptItemsWithBatches(receiptId: string) {
    return this.db.query.receiptItems.findMany({
      where: eq(schema.receiptItems.receiptId, receiptId),
      with: {
        batch: { with: { product: { with: { baseUnit: true } } } },
        product: { with: { baseUnit: true } },
      },
    });
  }

  async getReceiptItemsWithBatchesTx(tx: DbOrTx, receiptId: string) {
    return tx.query.receiptItems.findMany({
      where: eq(schema.receiptItems.receiptId, receiptId),
      with: {
        batch: { with: { product: { with: { baseUnit: true } } } },
        product: { with: { baseUnit: true } },
      },
    });
  }

  // Transaction Thêm Batch & Receipt Item
  // Lưu ý: Hàm này vẫn giữ transaction nội bộ vì nó độc lập với quy trình Complete
  // Transaction Thêm Receipt Item (Batch đã được tạo trước đó qua ProductService)
  async addReceiptItem(receiptId: string, batchId: number, quantity: number) {
    const [item] = await this.db
      .insert(schema.receiptItems)
      .values({
        receiptId: receiptId,
        batchId: batchId,
        quantity: quantity.toString(),
      })
      .returning();

    return item;
  }

  // Helper: Lấy SKU sản phẩm để sinh mã Batch
  async getProductDetails(productId: number) {
    const product = await this.db.query.products.findFirst({
      where: eq(schema.products.id, productId),
      columns: { sku: true, shelfLifeDays: true },
    });
    return product;
  }

  // Lấy thông tin chi tiết Batch để in tem
  async getBatchDetails(batchId: number) {
    // Join Batch -> Product (lấy SKU) -> ReceiptItem (lấy số lượng nhập ban đầu)
    const result = await this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        sku: schema.products.sku,
        initialQuantity: schema.receiptItems.quantity,
      })
      .from(schema.batches)
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .innerJoin(
        schema.receiptItems,
        eq(schema.receiptItems.batchId, schema.batches.id),
      )
      .where(eq(schema.batches.id, batchId))
      .limit(1);

    return result[0];
  }

  // Tìm ReceiptItem và check trạng thái Receipt cha
  async findReceiptItemByBatchId(batchId: number) {
    return this.db.query.receiptItems.findFirst({
      where: eq(schema.receiptItems.batchId, batchId),
      with: {
        receipt: true, // Join để lấy status của receipt
      },
    });
  }

  //Xóa Batch và ReceiptItem (Transaction)
  async deleteBatchAndItem(batchId: number, receiptItemId: number) {
    return this.db.transaction(async (tx) => {
      // Phải xóa ReceiptItem trước vì có khóa ngoại tham chiếu đến Batch
      await tx
        .delete(schema.receiptItems)
        .where(eq(schema.receiptItems.id, receiptItemId));

      // Sau đó xóa Batch
      await tx.delete(schema.batches).where(eq(schema.batches.id, batchId));
    });
  }

  // API 10: Get All Receipts (Read-only for Staff/Manager)
  async findAllReceipts(query: GetReceiptsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Filter by Status
    if (query.status) {
      conditions.push(eq(schema.receipts.status, query.status));
    }

    // Filter by Supplier
    if (query.supplierId) {
      conditions.push(eq(schema.receipts.supplierId, query.supplierId));
    }

    // Filter by Search (Receipt ID)
    if (query.search) {
      // Assuming search is by UUID since Receipt ID is UUID
      // Use ilike if it was a text field, but eq or similar for UUID if robust
      // Per requiremnt: "Search (Tìm theo Receipt ID - UUID)"
      // Let's use ilike on a casted text or just strict eq if user inputs UUID.
      // But typically search implies fuzzy. Since UUID is strict, let's try strict first or cast.
      // However, for UUID columns, usually we search by exact match if it's a valid UUID, or ignore if not?
      // Or cast to text and search? schema.receipts.id is UUID.
      // Let's assume partial match on UUID string for better UX or exact match.
      // Instructions say: "search: String (Tìm theo Receipt ID - UUID)"
      // Let's use cast to text for ilike to be safe/flexible or eq.
      // Given it's UUID, let's try `sql` cast for ilike to allow partial search if needed, or strictly eq if frontend sends full UUID.
      // Safe bet: strict eq if it looks like UUID, or skip?
      // Let's use strict eq for UUID to avoid DB errors on invalid UUID syntax in some dialects,
      // but Postgres can handle text comparison on UUIDs?
      // Actually, let's use ::text cast for ilike for flexibility.
      conditions.push(
        sql`${schema.receipts.id}::text ILIKE ${`%${query.search}%`}`,
      );
    }

    // Filter by Date
    if (query.fromDate) {
      conditions.push(gte(schema.receipts.createdAt, new Date(query.fromDate)));
    }
    if (query.toDate) {
      conditions.push(lte(schema.receipts.createdAt, new Date(query.toDate)));
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db.query.receipts.findMany({
      where: whereCondition,
      limit: limit,
      offset: offset,
      orderBy: (receipts, { desc }) => [desc(receipts.createdAt)],
      with: {
        supplier: true,
        user: true,
      },
    });

    const totalRaw = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.receipts)
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

  // API 11: Get Receipt Detail (Deep Relation)
  async findReceiptDetail(id: string) {
    return this.db.query.receipts.findFirst({
      where: eq(schema.receipts.id, id),
      with: {
        supplier: true,
        user: true,
        items: {
          with: {
            batch: {
              with: {
                product: {
                  with: {
                    baseUnit: true,
                  },
                },
              },
            },
            product: { with: { baseUnit: true } },
          },
        },
      },
    });
  }

  async findReceiptItemById(id: number) {
    return this.db.query.receiptItems.findFirst({
      where: eq(schema.receiptItems.id, id),
      with: { receipt: true },
    });
  }

  async approveVariance(tx: DbOrTx, receiptId: string, userId: string) {
    await tx
      .update(schema.receipts)
      .set({
        varianceApprovedBy: userId,
        varianceApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.receipts.id, receiptId));
  }

  /** Danh sách sản phẩm active cho màn nhập inbound (id, tên, SKU). */
  async listProductsForInbound(params: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: { id: number; name: string; sku: string }[]; total: number }> {
    const active = eq(schema.products.isActive, true);
    const term = params.search?.trim();
    const whereClause =
      term && term.length > 0
        ? and(
            active,
            or(
              ilike(schema.products.name, `%${term}%`),
              ilike(schema.products.sku, `%${term}%`),
            ),
          )
        : active;

    const items = await this.db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
      })
      .from(schema.products)
      .where(whereClause)
      .orderBy(asc(schema.products.name))
      .limit(params.limit)
      .offset(params.offset);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.products)
      .where(whereClause);

    return { items, total: Number(countRow?.count ?? 0) };
  }

  /** Xóa dòng phiếu nháp; nếu đã có batch (legacy) thì xóa cả batch */
  async deleteReceiptLine(receiptItemId: number) {
    return this.db.transaction(async (tx) => {
      const item = await tx.query.receiptItems.findFirst({
        where: eq(schema.receiptItems.id, receiptItemId),
        with: { receipt: true },
      });
      if (!item) {
        return { deleted: false as const };
      }
      if (item.receipt.status !== 'draft') {
        return { deleted: false as const, reason: 'not_draft' as const };
      }
      await tx
        .delete(schema.receiptItems)
        .where(eq(schema.receiptItems.id, receiptItemId));
      if (item.batchId) {
        await tx.delete(schema.batches).where(eq(schema.batches.id, item.batchId));
      }
      return { deleted: true as const };
    });
  }
}
