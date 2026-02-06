import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql, InferSelectModel } from 'drizzle-orm'; // Import InferSelectModel
import * as schema from '../../database/schema';
import { DATABASE_CONNECTION } from '../../database/database.constants';

// Định nghĩa kiểu dữ liệu cho Item trong Receipt để thay thế 'any'
// Dùng Pick để chỉ lấy các trường cần thiết cho transaction này
type ReceiptItemInput = Pick<
  InferSelectModel<typeof schema.receiptItems>,
  'batchId' | 'quantity'
>;

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

  // API :Transaction Hoàn tất nhập kho
  async completeReceiptTransaction(
    receiptId: string,
    warehouseId: number,
    receiptItems: ReceiptItemInput[],
  ) {
    return this.db.transaction(async (tx) => {
      // Cập nhật trạng thái Receipt -> COMPLETED
      await tx
        .update(schema.receipts)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(schema.receipts.id, receiptId));

      for (const item of receiptItems) {
        if (!item.batchId) {
          throw new Error(`Invalid Batch ID for item in receipt ${receiptId}`);
        }

        // Cập nhật trạng thái Batch -> AVAILABLE
        await tx
          .update(schema.batches)
          .set({ status: 'available' })
          .where(eq(schema.batches.id, item.batchId));

        // Upsert Inventory (Cộng dồn tồn kho)
        await tx
          .insert(schema.inventory)
          .values({
            warehouseId: warehouseId,
            batchId: item.batchId,
            quantity: item.quantity,
            reservedQuantity: '0',
          })
          .onConflictDoUpdate({
            target: [schema.inventory.warehouseId, schema.inventory.batchId],
            set: {
              quantity: sql`${schema.inventory.quantity} + ${item.quantity}`,
              updatedAt: new Date(),
            },
          });

        // log InventoryTransaction
        await tx.insert(schema.inventoryTransactions).values({
          warehouseId: warehouseId,
          batchId: item.batchId,
          type: 'import',
          quantityChange: item.quantity.toString(),
          referenceId: receiptId,
          reason: 'Inbound Receipt Completed',
        });
      }
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
  //Transaction Thêm Batch & Receipt Item
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
  async getProductSku(productId: number) {
    const product = await this.db.query.products.findFirst({
      where: eq(schema.products.id, productId),
      columns: { sku: true },
    });
    return product?.sku;
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
}
