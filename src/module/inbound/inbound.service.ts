import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { generateBatchCode } from 'src/common/utils/generate-batch-code.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { RequestWithUser } from '../auth/types/auth.types';
import { WarehouseRepository } from './../warehouse/warehouse.repository';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import { generateQrData } from './helpers/inbound.util';
import { InboundRepository } from './inbound.repository';

@Injectable()
export class InboundService {
  constructor(
    private readonly inboundRepo: InboundRepository,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly WarehouseRepo: WarehouseRepository,
  ) {}

  // API 1: Khởi tạo phiếu nhập
  async createReceipt(user: RequestWithUser['user'], dto: CreateReceiptDto) {
    const warehouseId = await this.WarehouseRepo.findCentralWarehouseId();
    if (!warehouseId) {
      throw new NotFoundException('Warehouse not found');
    }

    return this.inboundRepo.createReceipt({
      supplierId: dto.supplierId,
      warehouseId: warehouseId.id,
      createdBy: user.userId,
      note: dto.note,
      status: 'draft',
    });
  }

  // API 4: Chốt phiếu nhập kho (Atomic Transaction)
  async completeReceipt(receiptId: string) {
    return this.db.transaction(async (tx) => {
      // 1. Lock & Validate Receipt
      const receipt = await this.inboundRepo.findReceiptWithLock(tx, receiptId);
      if (!receipt) throw new NotFoundException('Receipt not found');
      if (receipt.status !== 'draft') {
        throw new BadRequestException('Only DRAFT receipts can be completed');
      }

      // 2. Lấy danh sách hàng hóa (Read-only, no lock needed on items if receipt is locked)
      // Note: We use the repository method which uses the standard connection.
      // Since the receipt is locked for update, no one else can modify its items effectively during this transaction
      // if modification requires locking the receipt first (which we enforce in business logic).
      const items =
        await this.inboundRepo.getReceiptItemsWithBatches(receiptId);
      if (items.length === 0) {
        throw new BadRequestException('Cannot complete an empty receipt');
      }

      // 3. Update Receipt Status
      await this.inboundRepo.updateReceiptStatus(tx, receiptId, 'completed');

      // 4. Process Each Item
      for (const item of items) {
        if (!item.batchId) {
          throw new BadRequestException(
            `Invalid batch configuration for item in receipt`,
          );
        }

        // A. Activate Batch
        await this.inboundRepo.updateBatchStatus(tx, item.batchId, 'available');

        // B. Upsert Inventory
        // quantity is string/decimal
        await this.inboundRepo.upsertInventory(
          tx,
          receipt.warehouseId,
          item.batchId,
          item.quantity,
        );

        // C. Audit Log
        await this.inboundRepo.insertInventoryTransaction(tx, {
          warehouseId: receipt.warehouseId,
          batchId: item.batchId,
          quantityChange: item.quantity,
          referenceId: `RECEIPT_ID_${receiptId}`,
        });
      }

      return { message: 'Success' };
    });
  }

  // API 2: Thêm hàng vào phiếu (Tạo Batch)
  async addReceiptItem(receiptId: string, dto: AddReceiptItemDto) {
    // 1. Validate Status
    const receipt = await this.inboundRepo.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
    if (receipt.status !== 'draft') {
      throw new BadRequestException(
        'Không thể thêm hàng vào phiếu không phải là DRAFT',
      );
    }

    // 2. Get Product Info (SKU + ShelfLife)
    const product = await this.inboundRepo.getProductDetails(dto.productId);
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    if (!product.shelfLifeDays) {
      throw new BadRequestException(
        'Sản phẩm chưa được cấu hình hạn sử dụng (Shelf Life)',
      );
    }

    // 3. Auto-calculate Dates
    const manufactureDate = new Date();
    const expiryDate = new Date(
      manufactureDate.getTime() + product.shelfLifeDays * 24 * 60 * 60 * 1000,
    );

    // 4. Expiry Warning Check (High-perishability: < 48 hours)
    let warning: string | undefined;
    if (product.shelfLifeDays < 2) {
      warning = 'Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)';
    }

    // 5. Generate Batch Code
    const batchCode = generateBatchCode(product.sku);

    // 6. Create Batch & Receipt Item
    const batch = await this.inboundRepo.addBatchToReceipt(receiptId, {
      productId: dto.productId,
      batchCode: batchCode,
      expiryDate: expiryDate.toISOString(), // Used for DB storage
      quantity: dto.quantity.toString(),
    });

    return {
      batchId: batch.id,
      batchCode: batch.batchCode,
      manufactureDate,
      expiryDate,
      warning,
    };
  }

  // API 3: Lấy data in tem
  async getBatchLabel(batchId: number) {
    const batch = await this.inboundRepo.getBatchDetails(batchId);
    if (!batch) throw new NotFoundException('Không tìm thấy lô hàng');

    return {
      qrData: generateQrData(batch),
      readableData: {
        batchCode: batch.batchCode,
        sku: batch.sku,
        expiryDate: batch.expiryDate,
      },
    };
  }

  // API 5: Xóa lô hàng lỗi
  async deleteBatchItem(batchId: number) {
    const item = await this.inboundRepo.findReceiptItemByBatchId(batchId);

    if (!item) throw new NotFoundException('Batch item not found');

    // Validate: Chỉ được xóa khi phiếu còn Draft
    if (item.receipt.status !== 'draft') {
      throw new BadRequestException(
        'Only items in DRAFT receipts can be deleted',
      );
    }

    await this.inboundRepo.deleteBatchAndItem(batchId, item.id);
    return { message: 'Success' };
  }

  // API 8: Yêu cầu in lại tem (Ghi log)
  async reprintBatchLabel(dto: ReprintBatchDto, user: RequestWithUser['user']) {
    const batch = await this.inboundRepo.getBatchDetails(dto.batchId);
    if (!batch) throw new NotFoundException('Batch not found');

    // LOGIC LOG: Ghi lại ai đã yêu cầu in lại
    console.warn(
      `[AUDIT] User ${user.userId} reprinted Batch ${batch.batchCode} at ${new Date().toISOString()}`,
    );

    return {
      qrData: generateQrData(batch),
      readableData: {
        batchCode: batch.batchCode,
        sku: batch.sku,
        expiryDate: batch.expiryDate,
      },
    };
  }
  async getAllReceipts(page: number, limit: number) {
    const { data, total } = await this.inboundRepo.findAllReceipts(page, limit);

    return {
      data: data.map((receipt) => ({
        id: receipt.id,
        status: receipt.status,
        note: receipt.note,
        supplierName: receipt.supplier.name,
        createdBy: receipt.user.username,
        createdAt: receipt.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // API: Get Receipt Details
  async getReceiptById(id: string) {
    const receipt = await this.inboundRepo.findReceiptDetail(id);
    if (!receipt) {
      throw new NotFoundException(
        'Không tìm thấy phiếu nhập (Receipt not found)',
      );
    }

    return {
      id: receipt.id,
      status: receipt.status,
      note: receipt.note,
      createdAt: receipt.createdAt,
      supplier: {
        id: receipt.supplier.id,
        name: receipt.supplier.name,
        contactName: receipt.supplier.contactName,
        phone: receipt.supplier.phone,
      },
      createdBy: {
        id: receipt.user.id,
        username: receipt.user.username,
      },
      items: receipt.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        batch: item.batch
          ? {
              id: item.batch.id,
              batchCode: item.batch.batchCode,
              expiryDate: item.batch.expiryDate,
              status: item.batch.status,
              product: {
                id: item.batch.product.id,
                name: item.batch.product.name,
                sku: item.batch.product.sku,
                unit: item.batch.product.baseUnit?.name || 'N/A',
              },
            }
          : null,
      })),
    };
  }
}
