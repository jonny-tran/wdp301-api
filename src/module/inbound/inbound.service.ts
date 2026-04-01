import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { generateInboundBatchCode } from '../../common/utils/generate-batch-code.util';
import { nowVn, parseToStartOfDayVn } from '../../common/time/vn-time';
import { RequestWithUser } from '../auth/types/auth.types';
import { SystemConfigService } from '../system-config/system-config.service';
import { WarehouseRepository } from './../warehouse/warehouse.repository';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { GetInboundProductsDto } from './dto/get-inbound-products.dto';
import { GetReceiptsDto } from './dto/get-receipts.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import { generateQrData } from './helpers/inbound.util';
import { InboundRepository } from './inbound.repository';

type Tx = NodePgDatabase<typeof schema>;

const VARIANCE_CONFIG_KEY = 'inbound.receipt_variance_percent';

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly inboundRepo: InboundRepository,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly WarehouseRepo: WarehouseRepository,
    private readonly uow: UnitOfWork,
    private readonly systemConfigService: SystemConfigService,
  ) {}

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

  /**
   * Chốt phiếu: tạo lô ([SKU]-YYYYMMDD-RANDOM), tăng tồn, ghi log import trong transaction.
   * HSD: statedExpiryDate (NCC) hoặc ngày nhận (chốt phiếu, VN) + shelfLifeDays.
   * Dòng đã có batch (legacy) chỉ kích hoạt lô + nhập kho.
   */
  async completeReceipt(receiptId: string) {
    return this.uow.runInTransaction(async (tx) => {
      const receipt = await this.inboundRepo.findReceiptWithLock(tx, receiptId);
      if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
      if (receipt.status !== 'draft') {
        throw new BadRequestException(
          'Chỉ có thể hoàn thành phiếu nhập ở trạng thái nháp',
        );
      }

      const items = await this.inboundRepo.getReceiptItemsWithBatchesTx(
        tx,
        receiptId,
      );
      if (items.length === 0) {
        throw new BadRequestException(
          'Không thể hoàn thành phiếu nhập rỗng (chưa có hàng hóa)',
        );
      }

      await this.assertVarianceApprovedOrNotNeeded(tx, receipt, items);

      await this.inboundRepo.lockWarehouseStock(tx, receipt.warehouseId);

      await this.inboundRepo.updateReceiptStatus(tx, receiptId, 'completed');

      await this.inboundRepo.lockBatchCodeGeneration(tx);
      const receivingYmd = nowVn().format('YYYY-MM-DD');

      for (const item of items) {
        const acceptedStr =
          item.quantityAccepted != null
            ? String(item.quantityAccepted)
            : String(item.quantity);
        const accepted = parseFloat(acceptedStr);
        if (accepted <= 0) {
          continue;
        }

        if (item.batchId) {
          await this.completeLegacyLine(tx, receipt, receiptId, item, acceptedStr);
          continue;
        }

        const product = item.product;
        if (!product) {
          throw new BadRequestException(`Thiếu sản phẩm trên dòng #${item.id}`);
        }
        if (!product.shelfLifeDays) {
          throw new BadRequestException(
            `Sản phẩm #${product.id} chưa cấu hình shelf life`,
          );
        }
        if (!item.manufacturedDate) {
          throw new BadRequestException(
            `Thiếu ngày sản xuất trên dòng phiếu #${item.id}`,
          );
        }

        const mfg = parseToStartOfDayVn(item.manufacturedDate).format(
          'YYYY-MM-DD',
        );
        let expiryStr: string;
        if (item.statedExpiryDate) {
          expiryStr = parseToStartOfDayVn(item.statedExpiryDate).format(
            'YYYY-MM-DD',
          );
        } else {
          expiryStr = parseToStartOfDayVn(receivingYmd)
            .add(product.shelfLifeDays, 'day')
            .format('YYYY-MM-DD');
        }

        let batchCode = generateInboundBatchCode(product.sku);
        let batchCodeOk = false;
        for (let attempt = 0; attempt < 32; attempt++) {
          if (!(await this.inboundRepo.isBatchCodeTaken(tx, batchCode))) {
            batchCodeOk = true;
            break;
          }
          batchCode = generateInboundBatchCode(product.sku);
        }
        if (!batchCodeOk) {
          throw new BadRequestException(
            'Không sinh được mã lô duy nhất, vui lòng thử lại',
          );
        }
        const batch = await this.inboundRepo.insertBatch(tx, {
          productId: product.id,
          batchCode,
          manufacturedDate: mfg,
          expiryDate: expiryStr,
        });

        await this.inboundRepo.updateReceiptItemBatchLink(tx, item.id, batch.id);

        await this.inboundRepo.updateBatchStatus(tx, batch.id, 'available');
        await this.inboundRepo.upsertInventory(
          tx,
          receipt.warehouseId,
          batch.id,
          acceptedStr,
        );
        await this.inboundRepo.insertInventoryTransaction(tx, {
          warehouseId: receipt.warehouseId,
          batchId: batch.id,
          quantityChange: acceptedStr,
          referenceId: `RECEIPT:${receiptId}`,
          reason: `IMPORT receipt ${receiptId} line ${item.id}`,
        });
      }

      return { message: 'Success' };
    });
  }

  private async assertVarianceApprovedOrNotNeeded(
    tx: Tx,
    receipt: { id: string; varianceApprovedBy: string | null },
    items: Awaited<
      ReturnType<InboundRepository['getReceiptItemsWithBatchesTx']>
    >,
  ) {
    const threshold = parseFloat(
      (await this.systemConfigService.getConfigValue(VARIANCE_CONFIG_KEY)) ??
        '3',
    );
    if (Number.isNaN(threshold)) {
      return;
    }

    for (const item of items) {
      const exp = item.expectedQuantity
        ? parseFloat(String(item.expectedQuantity))
        : null;
      if (exp == null || exp <= 0) continue;

      const acc = parseFloat(
        String(item.quantityAccepted ?? item.quantity ?? '0'),
      );
      const rej = parseFloat(String(item.quantityRejected ?? '0'));
      const received = acc + rej;
      const overRatio = ((received - exp) / exp) * 100;
      if (overRatio > threshold && !receipt.varianceApprovedBy) {
        throw new BadRequestException(
          `Nhập vượt ngưỡng sai số (${threshold}%) so với số dự kiến dòng #${item.id}. Cần điều phối / quản lý phê duyệt trước.`,
        );
      }
    }
  }

  private async completeLegacyLine(
    tx: Tx,
    receipt: { warehouseId: number },
    receiptId: string,
    item: {
      id: number;
      batchId: number | null;
      quantity: string | null;
      quantityAccepted?: string | null;
    },
    quantityStr: string,
  ) {
    if (!item.batchId) return;
    await this.inboundRepo.updateBatchStatus(tx, item.batchId, 'available');
    await this.inboundRepo.upsertInventory(
      tx,
      receipt.warehouseId,
      item.batchId,
      quantityStr,
    );
    await this.inboundRepo.insertInventoryTransaction(tx, {
      warehouseId: receipt.warehouseId,
      batchId: item.batchId,
      quantityChange: quantityStr,
      referenceId: `RECEIPT:${receiptId}`,
      reason: `IMPORT receipt ${receiptId} line ${item.id} (legacy batch)`,
    });
  }

  /** Khai báo dòng nhận hàng (chưa tạo lô — lô sinh khi chốt phiếu) */
  async addReceiptItem(receiptId: string, dto: AddReceiptItemDto) {
    const receipt = await this.inboundRepo.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
    if (receipt.status !== 'draft') {
      throw new BadRequestException(
        'Không thể thêm hàng vào phiếu không phải là DRAFT',
      );
    }

    const product = await this.inboundRepo.getProductDetails(dto.productId);
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    if (!product.shelfLifeDays) {
      throw new BadRequestException(
        'Sản phẩm chưa được cấu hình hạn sử dụng (Shelf Life)',
      );
    }

    const rejected = dto.quantityRejected ?? 0;
    const accepted = dto.quantityAccepted;
    if (accepted + rejected <= 0) {
      throw new BadRequestException(
        'Tổng số lượng chấp nhận và từ chối phải lớn hơn 0',
      );
    }
    if (rejected > 0 && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Phải nhập lý do khi có số lượng từ chối');
    }

    parseToStartOfDayVn(dto.manufacturedDate);
    if (dto.statedExpiryDate) {
      const exp = parseToStartOfDayVn(dto.statedExpiryDate);
      const mfg = parseToStartOfDayVn(dto.manufacturedDate);
      if (exp.isBefore(mfg, 'day')) {
        throw new BadRequestException(
          'Hạn sử dụng không được trước ngày sản xuất',
        );
      }
    }

    let warning: string | undefined;
    if (product.shelfLifeDays < 2) {
      warning = 'Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)';
    }

    const qtyLine = (accepted + rejected).toString();
    const item = await this.inboundRepo.addReceiptItemLine({
      receiptId,
      productId: dto.productId,
      quantityLine: qtyLine,
      quantityAccepted: accepted.toString(),
      quantityRejected: rejected.toString(),
      rejectionReason: rejected > 0 ? dto.rejectionReason!.trim() : null,
      expectedQuantity:
        dto.expectedQuantity != null ? String(dto.expectedQuantity) : null,
      storageLocationCode: dto.storageLocationCode?.trim() ?? null,
      manufacturedDate: parseToStartOfDayVn(dto.manufacturedDate).format(
        'YYYY-MM-DD',
      ),
      statedExpiryDate: dto.statedExpiryDate
        ? parseToStartOfDayVn(dto.statedExpiryDate).format('YYYY-MM-DD')
        : null,
    });

    return {
      receiptItemId: item.id,
      manufactureDate: dto.manufacturedDate,
      expectedExpiryHint: dto.statedExpiryDate
        ? dto.statedExpiryDate
        : parseToStartOfDayVn(dto.manufacturedDate)
            .add(product.shelfLifeDays, 'day')
            .format('YYYY-MM-DD'),
      warning,
    };
  }

  async approveReceiptVariance(
    receiptId: string,
    user: RequestWithUser['user'],
  ) {
    return this.uow.runInTransaction(async (tx) => {
      const receipt = await this.inboundRepo.findReceiptWithLock(tx, receiptId);
      if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
      if (receipt.status !== 'draft') {
        throw new BadRequestException('Chỉ phê duyệt sai số khi phiếu còn nháp');
      }
      await this.inboundRepo.approveVariance(tx, receiptId, user.userId);
      return { message: 'Đã ghi nhận phê duyệt nhập dư' };
    });
  }

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

  async deleteReceiptLine(receiptId: string, receiptItemId: number) {
    const item = await this.inboundRepo.findReceiptItemById(receiptItemId);
    if (!item || item.receiptId !== receiptId) {
      throw new NotFoundException('Không tìm thấy dòng phiếu');
    }
    if (item.receipt.status !== 'draft') {
      throw new BadRequestException(
        'Chỉ có thể xóa hàng hóa trong phiếu nhập nháp',
      );
    }
    const result = await this.inboundRepo.deleteReceiptLine(receiptItemId);
    if (!result.deleted) {
      throw new BadRequestException('Không thể xóa dòng này');
    }
    return { message: 'Success' };
  }

  /** @deprecated dùng deleteReceiptLine */
  async deleteBatchItem(batchId: number) {
    const item = await this.inboundRepo.findReceiptItemByBatchId(batchId);
    if (!item) throw new NotFoundException('Không tìm thấy chi tiết lô hàng');
    if (item.receipt.status !== 'draft') {
      throw new BadRequestException(
        'Chỉ có thể xóa hàng hóa trong phiếu nhập nháp',
      );
    }
    await this.inboundRepo.deleteBatchAndItem(batchId, item.id);
    return { message: 'Success' };
  }

  async reprintBatchLabel(dto: ReprintBatchDto, user: RequestWithUser['user']) {
    const batch = await this.inboundRepo.getBatchDetails(dto.batchId);
    if (!batch) throw new NotFoundException('Không tìm thấy lô hàng');

    this.logger.warn(
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

  async getAllReceipts(query: GetReceiptsDto) {
    return this.inboundRepo.findAllReceipts(query);
  }

  async getReceiptById(id: string, omitExpected?: boolean) {
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
      varianceApprovedAt: receipt.varianceApprovedAt,
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
      items: receipt.items.map((item) => {
        const productFromBatch = item.batch?.product;
        const productFromLine = item.product;
        const p = productFromBatch ?? productFromLine;
        const base: Record<string, unknown> = {
          id: item.id,
          quantity: item.quantity,
          quantityAccepted: item.quantityAccepted,
          quantityRejected: item.quantityRejected,
          rejectionReason: item.rejectionReason,
          manufacturedDate: item.manufacturedDate,
          statedExpiryDate: item.statedExpiryDate,
          storageLocationCode: item.storageLocationCode,
          batch: item.batch
            ? {
                id: item.batch.id,
                batchCode: item.batch.batchCode,
                expiryDate: item.batch.expiryDate,
                status: item.batch.status,
                product: p
                  ? {
                      id: p.id,
                      name: p.name,
                      sku: p.sku,
                      unit: p.baseUnit?.name || 'N/A',
                    }
                  : null,
              }
            : null,
          product: p
            ? {
                id: p.id,
                name: p.name,
                sku: p.sku,
                unit: p.baseUnit?.name || 'N/A',
              }
            : null,
        };
        if (!omitExpected) {
          base.expectedQuantity = item.expectedQuantity;
        }
        return base;
      }),
    };
  }

  async getProductsForInbound(query: GetInboundProductsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const offset = (page - 1) * limit;
    const { items, total } = await this.inboundRepo.listProductsForInbound({
      search: query.search,
      limit,
      offset,
    });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }
}
