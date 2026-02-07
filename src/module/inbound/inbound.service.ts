import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InboundRepository } from './inbound.repository';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
// Import RequestWithUser
import { RequestWithUser } from '../auth/types/auth.types';

// Định nghĩa kiểu dữ liệu cho Batch Label (khớp với kết quả query từ Repository)
interface BatchLabelData {
  batchCode: string;
  sku: string;
  expiryDate: string;
  initialQuantity: string;
}
@Injectable()
export class InboundService {
  constructor(private readonly inboundRepo: InboundRepository) {}

  // API 1: Khởi tạo phiếu nhập
  async createReceipt(user: RequestWithUser['user'], dto: CreateReceiptDto) {
    // Giả định logic xác định kho (ví dụ hardcode kho trung tâm)
    const warehouseId = 1;

    return this.inboundRepo.createReceipt({
      supplierId: dto.supplierId,
      warehouseId: warehouseId,
      createdBy: user.userId,
      note: dto.note,
      status: 'draft',
    });
  }

  // API 4: Chốt phiếu nhập kho
  async completeReceipt(receiptId: string) {
    // 1. Validate: Phiếu tồn tại và đang ở trạng thái DRAFT
    const receipt = await this.inboundRepo.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.status !== 'draft') {
      throw new BadRequestException('Only DRAFT receipts can be completed');
    }

    // 2. Lấy danh sách hàng hóa trong phiếu
    const items = await this.inboundRepo.getReceiptItemsWithBatches(receiptId);
    if (items.length === 0) {
      throw new BadRequestException('Cannot complete an empty receipt');
    }

    // 3. Thực thi Transaction DB
    await this.inboundRepo.completeReceiptTransaction(
      receiptId,
      receipt.warehouseId,
      items,
    );

    return { message: 'Receipt completed successfully', receiptId };
  }

  // API 2: Thêm hàng vào phiếu (Tạo Batch)
  async addReceiptItem(receiptId: string, dto: AddReceiptItemDto) {
    //  Validate: Ngày hết hạn phải > Hiện tại
    const expiryDate = new Date(dto.expiryDate);
    const now = new Date();
    if (expiryDate <= now) {
      throw new BadRequestException('Expiry date must be in the future');
    }

    //  Validate: Phiếu nhập phải là DRAFT
    const receipt = await this.inboundRepo.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.status !== 'draft') {
      throw new BadRequestException('Cannot add items to a non-draft receipt');
    }

    //  Auto-gen Batch Code: SKU_YYYYMMDD_RANDOM
    const sku = await this.inboundRepo.getProductSku(dto.productId);
    if (!sku)
      throw new NotFoundException(`Product ID ${dto.productId} not found`);

    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // 20260206
    const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 số ngẫu nhiên
    const batchCode = `${sku}_${dateStr}_${randomSuffix}`;

    const batch = await this.inboundRepo.addBatchToReceipt(receiptId, {
      productId: dto.productId,
      batchCode: batchCode,
      expiryDate: dto.expiryDate,
      quantity: dto.quantity.toString(),
    });

    return {
      message: 'Item added and Batch created successfully',
      batchId: batch.id,
      batchCode: batch.batchCode,
    };
  }

  // Helper: Tạo dữ liệu QR Code
  private generateQrData(batch: BatchLabelData) {
    const qrPayload = {
      b: batch.batchCode, // Batch Code
      s: batch.sku, // SKU
      e: batch.expiryDate, // Expiry Date
      q: Number(batch.initialQuantity), // Quantity (Convert string -> number)
    };

    // Trả về chuỗi JSON để Mobile App parse
    return JSON.stringify(qrPayload);
  }

  // API 3: Lấy data in tem
  async getBatchLabel(batchId: number) {
    const batch = await this.inboundRepo.getBatchDetails(batchId);
    if (!batch) throw new NotFoundException('Batch not found');

    return {
      qrData: this.generateQrData(batch),
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
    return { message: 'Batch item deleted successfully' };
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
      qrData: this.generateQrData(batch),
      readableData: {
        batchCode: batch.batchCode,
        sku: batch.sku,
        expiryDate: batch.expiryDate,
      },
    };
  }
}
