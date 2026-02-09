import { Inject, Injectable } from '@nestjs/common';
import { eq, InferSelectModel, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';

type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

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
    tx: Transaction,
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
  async updateReceiptStatus(tx: Transaction, id: string, status: 'completed') {
    await tx
      .update(schema.receipts)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.receipts.id, id));
  }

  // Cập nhật trạng thái Batch
  async updateBatchStatus(
    tx: Transaction,
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
    tx: Transaction,
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
    tx: Transaction,
    data: {
      warehouseId: number;
      batchId: number;
      quantityChange: string;
      referenceId: string;
    },
  ) {
    await tx.insert(schema.inventoryTransactions).values({
      warehouseId: data.warehouseId,
      batchId: data.batchId,
      type: 'import',
      quantityChange: data.quantityChange,
      referenceId: data.referenceId,
      reason: 'Inbound Receipt Completed',
    });
  }

  // Helper: Lấy items của receipt
  async getReceiptItemsWithBatches(receiptId: string) {
    return this.db.query.receiptItems.findMany({
      where: eq(schema.receiptItems.receiptId, receiptId),
      with: {
        batch: true,
      },
    });
  }

  // Transaction Thêm Batch & Receipt Item
  // Lưu ý: Hàm này vẫn giữ transaction nội bộ vì nó độc lập với quy trình Complete
  async addBatchToReceipt(
    receiptId: string,
    data: {
      productId: number;
      batchCode: string;
      expiryDate: string; // ISO Date String
      quantity: string;
    },
  ) {
    return this.db.transaction(async (tx) => {
      // 1. Tạo Batch (Status: PENDING)
      const [batch] = await tx
        .insert(schema.batches)
        .values({
          productId: data.productId,
          batchCode: data.batchCode,
          expiryDate: data.expiryDate,
          status: 'pending',
        })
        .returning();

      // Link Batch vào Receipt
      await tx.insert(schema.receiptItems).values({
        receiptId: receiptId,
        batchId: batch.id,
        quantity: data.quantity,
      });

      return batch;
    });
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
  async findAllReceipts(page: number, limit: number) {
    const offset = (page - 1) * limit;

    // Filter: Status != cancelled (Active equivalent)
    const whereCondition = sql`${schema.receipts.status} != 'cancelled'`;

    const data = await this.db.query.receipts.findMany({
      where: whereCondition,
      limit: limit,
      offset: offset,
      orderBy: (receipts, { desc }) => [desc(receipts.createdAt)],
      with: {
        supplier: true, // Join to get Name
        user: true, // Join to get Creator Name
      },
    });

    const totalRaw = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.receipts)
      .where(whereCondition);

    return {
      data,
      total: Number(totalRaw[0]?.count || 0),
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
          },
        },
      },
    });
  }
}
