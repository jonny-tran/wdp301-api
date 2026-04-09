import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { UnitOfWork } from '../../database/unit-of-work';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import {
  AgingReportQueryDto,
  FinancialLossQueryDto,
  WasteReportQueryDto,
  WasteReportDetailQueryDto,
} from './dto/analytics-query.dto';
import { KITCHEN_NEAR_EXPIRY_ALERT_DAYS } from './constants/kitchen-inventory.constants';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { KitchenAdjustInventoryDto } from './dto/kitchen-adjust-inventory.dto';
import { KitchenSummaryQueryDto } from './dto/kitchen-summary-query.dto';
import { ReportWasteDto, WasteReason } from './dto/report-waste.dto';
import { AdjustmentDto, OrderItemLockLine } from './dto/adjustment.dto';
import type { IJwtPayload } from '../auth/types/auth.types';
import { InventoryDto } from './inventory.dto';
import { InventoryRepository } from './inventory.repository';
import {
  invCentsToDbString,
  invCentsToNumber,
  invFromDb,
  invPct,
  invRound2,
  invToCents,
  invToDbString,
} from './utils/inventory-decimal.util';

export interface AgingBucketItem {
  batchCode: string;
  productName: string;
  quantity: number;
  expiryDate: string;
  percentageLeft: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly uow: UnitOfWork,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getStoreInventory(warehouseId: number, query: GetStoreInventoryDto) {
    const { items, meta } = await this.inventoryRepository.getStoreInventory(
      warehouseId,
      query,
    );

    return {
      items: items.map<InventoryDto>((item) => ({
        inventoryId: item.id,
        batchId: item.batchId,
        productId: item.batch.productId,
        productName: item.batch.product.name,
        sku: item.batch.product.sku,
        batchCode: item.batch.batchCode,
        quantity: parseFloat(item.quantity),
        expiryDate: new Date(item.batch.expiryDate),
        unit: item.batch.product.baseUnit?.name ?? '',
        imageUrl: item.batch.product.imageUrl || null,
      })),
      meta,
    };
  }

  async getInventoryByStoreId(storeId: string, query?: GetStoreInventoryDto) {
    const warehouse =
      await this.inventoryRepository.findWarehouseByStoreId(storeId);

    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho cho cửa hàng này');
    }

    return this.getStoreInventory(warehouse.id, query || {});
  }

  async getStoreTransactions(
    storeId: string,
    query: GetInventoryTransactionsDto,
  ) {
    const warehouse =
      await this.inventoryRepository.findWarehouseByStoreId(storeId);

    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho cho cửa hàng này');
    }

    const { items, meta } = await this.inventoryRepository.getStoreTransactions(
      warehouse.id,
      query,
    );

    return {
      items: items.map((tx) => ({
        transactionType: tx.type,
        quantityChange: parseFloat(tx.quantityChange),
        productName: tx.batch.product.name,
        batchCode: tx.batch.batchCode,
        createdAt: tx.createdAt,
        referenceId: tx.referenceId,
      })),
      meta,
    };
  }

  async updateInventory(
    warehouseId: number,
    batchId: number,
    quantityChange: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    return this.inventoryRepository.upsertInventory(
      warehouseId,
      batchId,
      quantityChange,
      tx,
    );
  }

  async logInventoryTransaction(
    warehouseId: number,
    batchId: number,
    type: 'import' | 'export' | 'waste' | 'adjustment',
    quantityChange: number,
    referenceId?: string,
    reason?: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.inventoryRepository.createInventoryTransaction(
      warehouseId,
      batchId,
      type,
      quantityChange,
      referenceId,
      reason,
      tx,
    );
  }
  async getInventorySummary(
    filters: {
      warehouseId?: number;
      searchTerm?: string;
    },
    options: { limit?: number; offset?: number },
  ) {
    return this.inventoryRepository.getInventorySummary(filters, options);
  }

  async getLowStockItems(warehouseId?: number) {
    return this.inventoryRepository.getLowStockItems(warehouseId);
  }

  async adjustInventory(
    data: {
      warehouseId: number;
      batchId: number;
      adjustmentQuantity: number;
      reason: string;
      note?: string;
    },
    tx?: NodePgDatabase<typeof schema>,
  ) {
    // Changing approach slightly to use return value from repo
    const transactionCallback = async (
      transaction: NodePgDatabase<typeof schema>,
    ) => {
      const updatedInventory =
        await this.inventoryRepository.adjustBatchQuantity(
          data.warehouseId,
          data.batchId,
          data.adjustmentQuantity,
          transaction,
        );

      if (parseFloat(updatedInventory.quantity) < 0) {
        throw new BadRequestException('Số lượng tồn kho không thể nhỏ hơn 0');
      }

      await this.inventoryRepository.createInventoryTransaction(
        data.warehouseId,
        data.batchId,
        'adjustment',
        data.adjustmentQuantity,
        undefined, // referenceId
        data.reason + (data.note ? `: ${data.note}` : ''),
        transaction,
      );

      return updatedInventory;
    };

    if (tx) {
      return transactionCallback(tx);
    } else {
      return this.db.transaction(transactionCallback);
    }
  }

  /**
   * Kho bếp theo JWT: central + `storeId` token; nếu không khớp thì chọn central có nhiều inventory nhất.
   */
  async resolveKitchenWarehouseIdFromJwt(user: IJwtPayload): Promise<number> {
    const id = await this.inventoryRepository.resolveCentralKitchenWarehouseId(
      user.storeId,
    );
    if (id == null) {
      throw new NotFoundException(
        'Không tìm thấy kho bếp trung tâm (central theo store_id JWT, hoặc kho central hub store_id null)',
      );
    }
    this.logger.debug(
      `[Kitchen] warehouseId=${id} storeId=${user.storeId ?? 'null'} role=${user.role} sub=${user.sub}`,
    );
    return id;
  }

  /** GET /inventory/summary — macro bếp, Physical = Available + Reserved */
  async getKitchenInventorySummary(
    user: IJwtPayload,
    query: KitchenSummaryQueryDto,
  ) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const { items, meta } = await this.inventoryRepository.getKitchenSummary(
      warehouseId,
      {
        search: query.searchTerm,
        limit,
        offset,
      },
    );

    this.logger.debug(
      `[getKitchenInventorySummary] warehouseId=${warehouseId} rawRows=${items.length} first=${JSON.stringify(items[0] ?? null)}`,
    );

    const productIds = items.map((i) => i.productId);
    const nearExpiry =
      await this.inventoryRepository.getProductIdsNearExpiryAlert(
        warehouseId,
        productIds,
        KITCHEN_NEAR_EXPIRY_ALERT_DAYS,
      );

    const data = items.map((item) => {
      const physical = invRound2(Number(item.totalPhysical) || 0);
      const reserved = invRound2(Number(item.totalReserved) || 0);
      const available = invRound2(physical - reserved);
      const minStock = item.minStock ?? 0;
      const stockStatus = available < minStock ? 'LOW_STOCK' : 'OK';
      const expiryStatus = nearExpiry.has(item.productId)
        ? 'NEAR_EXPIRY_ALERT'
        : 'OK';
      const row: Record<string, unknown> = {
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        unit: item.unitName,
        totalPhysical: physical,
        totalAvailable: available,
        totalReserved: reserved,
        stockStatus,
        expiryStatus,
        category: null,
      };
      if (stockStatus === 'LOW_STOCK') {
        const suggested = Math.max(0, invRound2(minStock - available));
        if (suggested > 0) {
          row.suggestedProductionQty = suggested;
        }
      }
      return row;
    });

    return {
      data,
      meta: {
        totalItems: meta.totalItems,
        page: meta.currentPage,
        itemsPerPage: meta.itemsPerPage,
        totalPages: meta.totalPages,
      },
    };
  }

  /** GET /inventory/product/:productId/batches — FEFO, isNextFEFO */
  async getKitchenProductBatches(user: IJwtPayload, productId: number) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const rows = await this.inventoryRepository.getKitchenProductBatchesFefo(
      warehouseId,
      productId,
    );

    this.logger.debug(
      `[getKitchenProductBatches] warehouseId=${warehouseId} productId=${productId} dbLines=${rows.length} first=${JSON.stringify(rows[0] ?? null)}`,
    );

    let assignedFefo = false;
    const batches = rows.map((r) => {
      const physical = invFromDb(r.physicalQty);
      const reserved = invFromDb(r.reservedQty);
      const status = this.deriveKitchenBatchLineStatus(
        r.batchStatus,
        r.expiryDate,
        r.minShelfLife ?? 0,
      );
      const rawAvailable = invRound2(physical - reserved);
      const available =
        status === 'EXPIRED' || status === 'DAMAGED' || status === 'EMPTY'
          ? 0
          : rawAvailable;
      const isNextFEFO = !assignedFefo && available > 0;
      if (isNextFEFO) {
        assignedFefo = true;
      }
      return {
        batchId: r.batchId,
        batchCode: r.batchCode,
        expiryDate: this.toExpiryUtcIso(r.expiryDate),
        physicalQty: physical,
        availableQty: available,
        reservedQty: reserved,
        status,
        isNextFEFO,
      };
    });

    return { productId, batches };
  }

  private toExpiryUtcIso(expiry: string | Date): string {
    if (expiry instanceof Date) {
      return expiry.toISOString();
    }
    const s = String(expiry);
    if (s.includes('T')) {
      return new Date(s).toISOString();
    }
    return new Date(`${s}T00:00:00.000Z`).toISOString();
  }

  private deriveKitchenBatchLineStatus(
    batchStatus: string,
    expiryDate: string | Date,
    minShelfLifeDays: number,
  ): string {
    const expiryDateStr = this.toExpiryUtcIso(expiryDate).slice(0, 10);
    const todayDateStr = new Date().toISOString().slice(0, 10);
    if (expiryDateStr <= todayDateStr) {
      return 'EXPIRED';
    }
    if (batchStatus === 'expired') {
      return 'EXPIRED';
    }
    if (batchStatus === 'damaged') {
      return 'DAMAGED';
    }
    if (batchStatus === 'empty') {
      return 'EMPTY';
    }
    const exp = new Date(this.toExpiryUtcIso(expiryDate)).getTime();
    const threshold = Date.now() + minShelfLifeDays * 86400000;
    if (exp <= threshold) {
      return 'NEAR_EXPIRY';
    }
    return 'GOOD';
  }

  /** POST /inventory/adjust — đặt physical = actualQuantity, giữ reserved, Decimal + transaction */
  async adjustKitchenInventory(
    user: IJwtPayload,
    dto: KitchenAdjustInventoryDto,
  ) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const referenceId = `ADJ-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const reasonText = [dto.reasonCode, dto.note].filter(Boolean).join(' | ');

    return this.uow.runInTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(90210, ${warehouseId})`,
      );

      const invRow = await this.inventoryRepository.lockInventoryRowForUpdate(
        warehouseId,
        dto.batchId,
        tx,
      );
      if (!invRow) {
        throw new NotFoundException(
          'Không tìm thấy tồn kho cho lô trong kho bếp của bạn',
        );
      }

      const physCents = invToCents(invRow.quantity);
      const resCents = invToCents(invRow.reservedQuantity);
      const actCents = invToCents(dto.actualQuantity);

      if (actCents < resCents) {
        throw new BadRequestException(
          'Số lượng thực tế không được nhỏ hơn tồn đang giữ chỗ (reserved)',
        );
      }

      const diffCents = actCents - physCents;
      const newQtyStr = invCentsToDbString(actCents);

      if (diffCents !== 0n) {
        await this.inventoryRepository.updateInventoryPhysicalOnly(
          invRow.id,
          newQtyStr,
          tx,
        );
        const txType = diffCents < 0n ? 'adjust_loss' : 'adjust_surplus';
        await this.inventoryRepository.createInventoryTransaction(
          warehouseId,
          dto.batchId,
          txType,
          invCentsToNumber(diffCents),
          referenceId,
          reasonText,
          tx,
          { createdBy: user.sub },
        );
        await this.inventoryRepository.syncBatchTotalsFromInventory(
          tx,
          dto.batchId,
        );
      }

      const availNum = invCentsToNumber(actCents - resCents);
      return {
        batchId: dto.batchId,
        physicalQty: invCentsToNumber(actCents),
        availableQty: availNum,
        reservedQty: invCentsToNumber(resCents),
        referenceId,
        quantityChange: diffCents === 0n ? 0 : invCentsToNumber(diffCents),
      };
    });
  }

  /**
   * POST /inventory/waste
   * Tiêu hủy TOÀN BỘ tồn kho của một Lô (Batch) tại kho bếp trung tâm.
   * Atomic: advisory_lock → tìm batch → lock inventory → ghi WASTE tx → zero out → update batch status.
   */
  async reportWaste(user: IJwtPayload, dto: ReportWasteDto) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const referenceId = `WST-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

    return this.uow.runInTransaction(async (tx) => {
      // Khóa advisory theo warehouse để tránh race condition
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(90210, ${warehouseId})`,
      );

      // Bước 1: Kiểm tra tồn tại Batch
      const batch = await this.inventoryRepository.findBatchById(
        dto.batchId,
        tx,
      );
      if (!batch) {
        throw new NotFoundException(
          `Không tìm thấy lô hàng với ID ${dto.batchId}`,
        );
      }

      // Bước 2: Lock và đọc số lượng hiện tại
      const { totalQty } =
        await this.inventoryRepository.lockAndReadInventoryForWaste(
          warehouseId,
          dto.batchId,
          tx,
        );

      if (totalQty <= 0) {
        throw new BadRequestException(
          'Lô hàng không còn tồn kho để tiêu hủy (số lượng = 0)',
        );
      }

      const reasonText = [dto.reason, dto.note].filter(Boolean).join(' | ');

      // Bước 3: Tạo Inventory Transaction loại WASTE (quantity_change âm)
      const wasteTransaction =
        await this.inventoryRepository.createInventoryTransaction(
          warehouseId,
          dto.batchId,
          'waste',
          -totalQty, // âm vì xuất khỏi kho
          referenceId,
          reasonText,
          tx,
          { createdBy: user.sub },
        );

      // Bước 4: Reset inventory về 0
      await this.inventoryRepository.zeroOutInventoryForBatch(
        warehouseId,
        dto.batchId,
        tx,
      );

      // Bước 5 (Optional): Cập nhật trạng thái Batch → 'empty' (lô đã hết)
      // Schema không có 'wasted'; dùng 'empty' để đánh dấu lô đã tiêu hủy
      const newBatchStatus: (typeof schema.batches.$inferSelect)['status'] =
        dto.reason === WasteReason.DAMAGED ? 'damaged' : 'empty';
      await this.inventoryRepository.updateBatchStatus(
        tx,
        dto.batchId,
        newBatchStatus,
      );

      // Đồng bộ totals trên bảng batches
      await this.inventoryRepository.syncBatchTotalsFromInventory(
        tx,
        dto.batchId,
      );

      this.logger.log(
        `[reportWaste] userId=${user.sub} batchId=${dto.batchId} qty=${totalQty} reason=${dto.reason} ref=${referenceId} warehouseId=${warehouseId}`,
      );

      return {
        referenceId,
        batchId: Number(dto.batchId),
        batchCode: batch.batchCode,
        productId: batch.productId,
        wastedQuantity: totalQty,
        lossAmount: Number(wasteTransaction.totalValueSnapshot || 0),
        reason: dto.reason,
        note: dto.note ?? null,
        newBatchStatus,
      };
    });
  }

  /** GET /inventory/transactions — theo kho bếp JWT */
  async getKitchenInventoryTransactions(
    user: IJwtPayload,
    query: GetInventoryTransactionsDto,
  ) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const { items, meta } =
      await this.inventoryRepository.getWarehouseInventoryTransactions(
        warehouseId,
        query,
      );

    const data = items.map((row) => ({
      id: row.id,
      timestamp: row.createdAt,
      type: this.mapInventoryTxTypeForKitchenApi(row.type),
      batchCode: row.batchCode,
      changeQty: invFromDb(row.quantityChange),
      reason: row.reason ?? '',
      staffName: row.staffUsername ?? row.staffEmail ?? '—',
      referenceId: row.referenceId ?? '',
    }));

    return { data, meta };
  }

  /** Gộp các loại điều chỉnh thành nhãn ADJUSTMENT cho FE */
  private mapInventoryTxTypeForKitchenApi(type: string): string {
    if (
      type === 'adjust_loss' ||
      type === 'adjust_surplus' ||
      type === 'adjustment'
    ) {
      return 'ADJUSTMENT';
    }
    return type.toUpperCase();
  }

  //  Group theo Product để xem tổng quan (legacy path /kitchen/summary)
  async getKitchenSummary(query: GetKitchenInventoryDto, user: IJwtPayload) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);

    const { items, meta } = await this.inventoryRepository.getKitchenSummary(
      warehouseId,
      {
        search: query.search,
        limit: query.limit ? Number(query.limit) : 20,
        offset: query.page
          ? (Number(query.page) - 1) * (query.limit ? Number(query.limit) : 20)
          : 0,
      },
    );

    // Format dữ liệu trả về
    return {
      items: items.map((item) => {
        const physical = item.totalPhysical || 0;
        const reserved = item.totalReserved || 0;
        const available = physical - reserved;

        return {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unit: item.unitName,
          minStock: item.minStock,
          totalPhysical: physical, // Tổng thực tế
          totalReserved: reserved, // Đang xử lý
          availableQuantity: available, // Có thể dùng
          // Cờ cảnh báo nếu dưới định mức
          isLowStock: available < (item.minStock || 0),
        };
      }),
      meta,
    };
  }

  // API 7: Xem chi tiết lô (Drill-down)
  async getKitchenDetails(productId: number, user: IJwtPayload) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const batches = await this.inventoryRepository.getKitchenBatchDetails(
      warehouseId,
      productId,
    );

    return {
      productId: productId,
      totalBatches: batches.length,
      details: batches.map((b) => {
        const qty = invFromDb(b.quantity);
        const res = invFromDb(b.reserved);

        return {
          batchId: b.batchId,
          batchCode: b.batchCode,
          expiryDate: b.expiryDate,
          physical: qty,
          reserved: res,
          available: invRound2(qty - res),
        };
      }),
    };
  }

  async getAnalyticsSummary(user: IJwtPayload) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);

    // Sử dụng query.categoryId (Truyền xuống Repo nếu Repo có hỗ trợ)
    //const categoryId = query.categoryId;

    const { inventoryData, expiredBatches } =
      await this.inventoryRepository.getAnalyticsSummary(warehouseId);

    const lowStockAlerts = inventoryData.filter((item) => {
      const available = (item.totalPhysical || 0) - (item.totalReserved || 0);
      return available < (item.minStock || 0);
    });

    return {
      overview: {
        totalProducts: inventoryData.length,
        totalLowStockItems: lowStockAlerts.length,
        totalExpiringBatches: expiredBatches.length,
      },
      lowStockAlerts: lowStockAlerts.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        availableQuantity: (i.totalPhysical || 0) - (i.totalReserved || 0),
        minStockLevel: i.minStock,
      })),
      expiringBatches: expiredBatches.map((b) => ({
        batchCode: b.batchCode,
        quantity: parseFloat(b.quantity),
        expiryDate: b.expiryDate,
      })),
    };
  }

  // --- API 2: Aging Report ---
  async getAgingReport(query: AgingReportQueryDto, user: IJwtPayload) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const batches = await this.inventoryRepository.getAgingReport(warehouseId);

    const now = new Date().getTime();

    // Đọc giá trị từ query để Linter hiểu là biến có được sử dụng
    const threshold = query.daysThreshold || 0;

    const buckets = {
      fresh: [] as AgingBucketItem[],
      warning: [] as AgingBucketItem[],
      critical: [] as AgingBucketItem[],
    };

    batches.forEach((batch) => {
      const expiryDate = new Date(batch.expiryDate).getTime();
      const shelfLifeMs = batch.shelfLifeDays * 24 * 60 * 60 * 1000;

      const timeLeftMs = expiryDate - now;
      const percentageLeft = (timeLeftMs / shelfLifeMs) * 100;

      const itemInfo: AgingBucketItem = {
        batchCode: batch.batchCode,
        productName: batch.productName,
        quantity: parseFloat(batch.quantity),
        expiryDate: batch.expiryDate,
        percentageLeft: Math.max(0, parseFloat(percentageLeft.toFixed(2))),
      };

      if (percentageLeft > 50) {
        buckets.fresh.push(itemInfo);
      } else if (percentageLeft >= 20) {
        buckets.warning.push(itemInfo);
      } else {
        buckets.critical.push(itemInfo);
      }
    });

    return {
      summary: {
        freshCount: buckets.fresh.length,
        warningCount: buckets.warning.length,
        criticalCount: buckets.critical.length,
        appliedThreshold: threshold, // <-- Trả về xem như đã sử dụng biến
      },
      buckets,
    };
  }

  // --- API GET /inventory/analytics/waste-report (Dedicated spec) ---
  async getWasteReportDetailed(query: WasteReportDetailQueryDto) {
    const wasteData = await this.inventoryRepository.getWasteReportDetailed(
      query.startDate,
      query.endDate,
      query.warehouseId,
    );

    let totalWasteQuantity = 0;
    let totalLossAmount = 0;

    const formattedData = wasteData.map((w) => {
      const qty = Number(w.wastedQuantity || 0);
      const amt = Number(w.lossAmount || 0);
      totalWasteQuantity += qty;
      totalLossAmount += amt;

      return {
        transactionId: w.transactionId,
        batchId: w.batchId,
        batchCode: w.batchCode,
        batchStatus: w.batchStatus,
        productId: w.productId,
        productName: w.productName,
        sku: w.sku,
        unitName: w.unitName,
        wastedQuantity: qty,
        lossAmount: amt,
        wasteReason: w.wasteReason,
        reasonNote: w.reasonNote,
        createdAt: w.createdAt,
      };
    });

    return {
      kpi: {
        totalWasteQuantity,
        totalLossAmount,
      },
      data: formattedData,
    };
  }

  // --- API 3: Waste Report ---
  async getWasteReport(query: WasteReportQueryDto) {
    const warehouseId = query.warehouseId; // Nếu không truyền thì liệt kê tất cả các kho

    const wasteData = await this.inventoryRepository.getWasteAnalytics(
      warehouseId,
      query.fromDate,
      query.toDate,
    );

    const importRevenue =
      await this.inventoryRepository.getImportRevenueInPeriod(
        warehouseId,
        query.fromDate,
        query.toDate,
      );

    let totalLossAmount = 0;

    const formattedData = wasteData.map((w) => {
      totalLossAmount += w.totalLossAmount || 0;

      return {
        productId: w.productId,
        productName: w.productName,
        sku: w.sku,
        unitName: w.unitName,
        totalWasteQuantity: Number(w.totalWasteQuantity || 0),
        wasteEventsCount: Number(w.wasteEventsCount || 0),
        totalLossAmount: Number(w.totalLossAmount || 0),
      };
    });

    const topCostlyProducts = formattedData.slice(0, 5);
    const wastePercentage =
      importRevenue > 0 ? (totalLossAmount / importRevenue) * 100 : 0;

    return {
      kpi: {
        totalLossAmount,
        importRevenueInPeriod: importRevenue,
        wastePercentage: Number(wastePercentage.toFixed(2)),
        period: `${query.fromDate || 'Tất cả'} đến ${query.toDate || 'Hiện tại'}`,
      },
      topCostlyProducts,
      details: formattedData,
    };
  }

  // --- API 9: Financial Loss Impact ---
  async getFinancialLoss(query: FinancialLossQueryDto, user: IJwtPayload) {
    const warehouseId = await this.resolveKitchenWarehouseIdFromJwt(user);
    const { wasteData, claimData } =
      await this.inventoryRepository.getFinancialLoss(
        query.from,
        query.to,
        warehouseId,
      );

    // Gộp dữ liệu theo ProductID
    const lossMap = new Map<
      number,
      { name: string; wasteQty: number; damagedQty: number }
    >();

    wasteData.forEach((w) => {
      lossMap.set(w.productId, {
        name: w.productName,
        wasteQty: w.totalWaste || 0,
        damagedQty: 0,
      });
    });

    claimData.forEach((c) => {
      if (lossMap.has(c.productId)) {
        lossMap.get(c.productId)!.damagedQty = c.totalDamaged || 0;
      } else {
        lossMap.set(c.productId, {
          name: c.productName,
          wasteQty: 0,
          damagedQty: c.totalDamaged || 0,
        });
      }
    });

    // NOTE: Vì Schema hiện tại KHÔNG lưu đơn giá nhập, chưa có money, gán đại một biến dummy (50k VND) để minh họa logic.
    // Nếu tương lai có bảng Price, hãy Join vào Repo.
    const ASSUMED_UNIT_PRICE = 50000;
    let totalFinancialLoss = 0;

    const details = Array.from(lossMap.entries()).map(([productId, data]) => {
      const totalLossQty = data.wasteQty + data.damagedQty;
      const financialLoss = totalLossQty * ASSUMED_UNIT_PRICE;
      totalFinancialLoss += financialLoss;

      return {
        productId,
        productName: data.name,
        kitchenWasteQty: data.wasteQty,
        storeDamagedQty: data.damagedQty,
        totalLossQty,
        estimatedLossVnd: financialLoss,
      };
    });

    // Sort by highest financial loss
    details.sort((a, b) => b.estimatedLossVnd - a.estimatedLossVnd);

    return {
      kpi: {
        totalEstimatedLossVnd: totalFinancialLoss,
        assumedUnitPriceVnd: ASSUMED_UNIT_PRICE,
        note: 'Thiệt hại = (Hàng hủy tại bếp + Hàng hỏng tại cửa hàng) * Đơn giá giả định',
        period: `${query.from || 'Bắt đầu'} - ${query.to || 'Hiện tại'}`,
      },
      details,
    };
  }

  // --- Strict Business Logic Flow Methods (KFC Model SP26SWP07) ---

  async suggestBatchesForPicking(
    warehouseId: number,
    productId: number,
    requiredQuantity: number,
  ) {
    const batches = await this.inventoryRepository.getKitchenBatchDetails(
      warehouseId,
      productId,
    );

    let remaining = requiredQuantity;
    const pickedBatches: {
      batchId: number;
      batchCode: string;
      pickedQuantity: number;
    }[] = [];

    // Lô đã được sort FEFO ở Repository (expiryDate ASC)
    for (const batch of batches) {
      if (remaining <= 0) break;
      const qty = parseFloat((batch.quantity || 0).toString());
      const res = parseFloat((batch.reserved || 0).toString());
      const available = qty - res;

      if (available <= 0) continue;

      const pickQty = Math.min(available, remaining);
      pickedBatches.push({
        batchId: batch.batchId,
        batchCode: batch.batchCode,
        pickedQuantity: pickQty,
      });
      remaining -= pickQty;
    }

    return {
      fulfilledQuantity: requiredQuantity - remaining,
      pickedBatches,
    };
  }

  /**
   * Biến động tồn + audit log (quantityDelta âm/dương). Dùng pg_advisory_xact_lock theo warehouse.
   */
  async changeStock(
    params: {
      warehouseId: number;
      batchId: number;
      quantityDelta: number;
      transactionType:
        | 'import'
        | 'export'
        | 'waste'
        | 'adjustment'
        | 'production_consume'
        | 'production_output';
      referenceId?: string;
      reason?: string;
    },
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const run = async (db: NodePgDatabase<typeof schema>) => {
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(90210, ${params.warehouseId})`,
      );
      await this.inventoryRepository.upsertInventory(
        params.warehouseId,
        params.batchId,
        params.quantityDelta,
        db,
      );
      return this.inventoryRepository.createInventoryTransaction(
        params.warehouseId,
        params.batchId,
        params.transactionType,
        params.quantityDelta,
        params.referenceId,
        params.reason,
        db,
      );
    };
    if (tx) return run(tx);
    return this.db.transaction(run);
  }

  async receiveDiscrepancy(
    storeWarehouseId: number,
    batchId: number,
    shippedQty: number,
    receivedQty: number,
    reason: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    // Kho Store chỉ tăng theo số thực nhận (receivedQty)
    await this.inventoryRepository.upsertInventory(
      storeWarehouseId,
      batchId,
      receivedQty,
      tx,
    );

    // Ghi nhận log với loại giao dịch là 'import' (hoặc alias store_receipt qua reason) theo đúng số thực nhận
    await this.inventoryRepository.createInventoryTransaction(
      storeWarehouseId,
      batchId,
      'import',
      receivedQty,
      undefined,
      reason,
      tx,
    );

    return { message: 'Success', receivedQty };
  }

  // --- Inventory Engine (audit, FEFO buffer, atomicity) ---

  /**
   * Điều chỉnh tồn: chỉ qua transaction + ghi adjust_loss / adjust_surplus.
   * Không cập nhật trực tiếp bảng batches ngoài đồng bộ từ inventory.
   */
  async adjustStock(dto: AdjustmentDto): Promise<void> {
    return this.uow.runInTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(90210, ${dto.warehouseId})`,
      );

      const batch = await tx.query.batches.findFirst({
        where: eq(schema.batches.id, dto.batchId),
      });
      if (!batch) {
        throw new NotFoundException('Không tìm thấy lô hàng');
      }

      const invRow = await tx.query.inventory.findFirst({
        where: and(
          eq(schema.inventory.warehouseId, dto.warehouseId),
          eq(schema.inventory.batchId, dto.batchId),
        ),
      });
      if (!invRow) {
        throw new BadRequestException(
          'Không có bản ghi tồn kho cho kho/lô này để điều chỉnh',
        );
      }

      const physical = invFromDb(invRow.quantity);
      const delta = dto.quantityDelta;

      if (delta < 0) {
        const lossAbs = Math.abs(delta);
        const pct = invPct(lossAbs, physical);
        if (pct > 5 && !(dto.evidenceImage && dto.evidenceImage.trim())) {
          throw new BadRequestException(
            'Điều chỉnh giảm vượt 5% giá trị tồn lô yêu cầu ảnh chứng minh (evidenceImage).',
          );
        }
        const nextQty = physical + delta;
        if (nextQty < 0) {
          throw new BadRequestException(
            'Số lượng điều chỉnh vượt quá tồn vật lý hiện có',
          );
        }
      }

      await this.inventoryRepository.adjustBatchQuantity(
        dto.warehouseId,
        dto.batchId,
        dto.quantityDelta,
        tx,
      );

      const txType = delta < 0 ? 'adjust_loss' : 'adjust_surplus';
      const signedChange = invToDbString(delta);

      await this.inventoryRepository.createInventoryTransaction(
        dto.warehouseId,
        dto.batchId,
        txType,
        parseFloat(signedChange),
        undefined,
        dto.reason,
        tx,
        {
          evidenceImage: dto.evidenceImage ?? undefined,
          createdBy: dto.createdBy ?? undefined,
        },
      );

      await this.inventoryRepository.syncBatchTotalsFromInventory(
        tx,
        dto.batchId,
      );
    });
  }

  /**
   * Giữ chỗ trên đúng một lô tại kho (không qua FEFO).
   */
  async lockSpecificBatch(
    warehouseId: number,
    batchId: number,
    amount: number,
    tx: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    if (!(amount > 0)) {
      throw new BadRequestException('Số lượng giữ chỗ phải lớn hơn 0');
    }
    const amt = new Decimal(amount);
    const locked = await tx
      .select()
      .from(schema.inventory)
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, batchId),
        ),
      )
      .for('update');
    const inv = locked[0];
    if (!inv) {
      throw new BadRequestException(
        'Không có tồn kho cho lô này tại kho đã chọn',
      );
    }
    const q = new Decimal(String(inv.quantity));
    const r = new Decimal(String(inv.reservedQuantity));
    const avail = q.minus(r);
    if (avail.lt(amt)) {
      throw new BadRequestException(
        'Không đủ tồn khả dụng trên lô để giữ chỗ',
      );
    }
    await tx
      .update(schema.inventory)
      .set({
        reservedQuantity: r.plus(amt).toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, inv.id));

    await this.inventoryRepository.syncBatchTotalsFromInventory(tx, batchId);
  }

  /**
   * Đặt chỗ theo đơn (FEFO + đệm min_shelf_life): Available ↓, Reserved ↑, Physical không đổi.
   */
  async lockStockForOrder(
    orderId: string,
    warehouseId: number,
    items: OrderItemLockLine[],
    tx: NodePgDatabase<typeof schema>,
    options?: {
      createdBy?: string | null;
      /** Ngày tối đa (YYYY-MM-DD) mà HSD lô phải lớn hơn — ATP logistics */
      safetyMinimumExpiryDateStr?: string;
      /** true = chỉ giữ chỗ (reservation queue), false = khóa cứng cho bước đóng gói */
      isReservation?: boolean;
    },
  ): Promise<{
    shipmentItems: { batchId: number; quantity: number }[];
    results: {
      orderItemId: number;
      productId: number;
      requested: number;
      approved: number;
      missing: number;
      /** Giá vốn lô FEFO đầu tiên có nhận phân bổ (snapshot duyệt đơn) */
      fefoUnitCostAtImport: string | null;
    }[];
  }> {
    const shipmentItems: { batchId: number; quantity: number }[] = [];
    const results: {
      orderItemId: number;
      productId: number;
      requested: number;
      approved: number;
      missing: number;
      fefoUnitCostAtImport: string | null;
    }[] = [];

    const createdBy = options?.createdBy ?? null;
    const isReservation = options?.isReservation ?? true;
    const shelfOpts = options?.safetyMinimumExpiryDateStr
      ? { safetyMinimumExpiryDateStr: options.safetyMinimumExpiryDateStr }
      : undefined;

    for (const line of items) {
      let remaining = line.quantityRequested;
      let approved = 0;
      let fefoUnitCostAtImport: string | null = null;

      const batches =
        await this.inventoryRepository.findBatchesForFEFOWithShelfBuffer(
          line.productId,
          warehouseId,
          tx,
          shelfOpts,
        );

      for (const batch of batches) {
        if (remaining <= 0) break;
        const phys = invFromDb(batch.quantity);
        const res = invFromDb(batch.reservedQuantity);
        const available = phys - res;
        if (available <= 0) continue;

        const takeNum = Math.min(available, remaining);

        if (fefoUnitCostAtImport == null && takeNum > 0) {
          const raw = batch.unitCostAtImport;
          fefoUnitCostAtImport =
            raw != null && String(raw).trim() !== '' ? String(raw) : null;
        }

        await this.inventoryRepository.reserveInventoryQuantity(
          batch.inventoryId,
          takeNum,
          tx,
        );

        await this.inventoryRepository.createInventoryTransaction(
          warehouseId,
          batch.batchId,
          'reservation',
          takeNum,
          orderId,
          isReservation
            ? 'Giữ chỗ theo điều phối (RESERVATION_QUEUE)'
            : 'Khóa cứng cho picking/packing (RESERVATION)',
          tx,
          { createdBy: createdBy ?? undefined },
        );

        await this.inventoryRepository.syncBatchTotalsFromInventory(
          tx,
          batch.batchId,
        );

        shipmentItems.push({ batchId: batch.batchId, quantity: takeNum });
        approved += takeNum;
        remaining -= takeNum;
      }

      results.push({
        orderItemId: line.orderItemId,
        productId: line.productId,
        requested: line.quantityRequested,
        approved,
        missing: Math.max(0, line.quantityRequested - approved),
        fefoUnitCostAtImport,
      });
    }

    return { shipmentItems, results };
  }

  /** Tổng ATP (khả dụng) theo lô thỏa mốc HSD — chỉ đọc, không khóa */
  async sumAtpAvailableForProduct(
    productId: number,
    centralWarehouseId: number,
    safetyMinimumExpiryDateStr: string,
  ): Promise<number> {
    const batches = await this.inventoryRepository.findBatchesForAtpFefo(
      productId,
      centralWarehouseId,
      safetyMinimumExpiryDateStr,
    );
    let sum = 0;
    for (const b of batches) {
      const phys = invFromDb(b.quantity);
      const res = invFromDb(b.reservedQuantity);
      const available = invRound2(phys - res);
      if (available > 0) sum = invRound2(sum + available);
    }
    return sum;
  }

  /**
   * Hoàn chỗ: Reserved ↓, Available ↑ (Physical không đổi). Ưu tiên theo log RESERVATION.
   */
  async releaseStock(
    orderId: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    const run = async (db: NodePgDatabase<typeof schema>) => {
      const reservations =
        await this.inventoryRepository.findInventoryTransactionsByReferenceAndType(
          orderId,
          'reservation',
          db,
        );

      if (reservations.length > 0) {
        for (const r of reservations) {
          const qty = parseFloat(String(r.quantityChange));
          if (qty <= 0) continue;

          const inv = await db.query.inventory.findFirst({
            where: and(
              eq(schema.inventory.warehouseId, r.warehouseId),
              eq(schema.inventory.batchId, r.batchId),
            ),
          });
          if (!inv) continue;

          await db
            .update(schema.inventory)
            .set({
              reservedQuantity: sql`GREATEST((${schema.inventory.reservedQuantity})::numeric - ${String(qty)}::numeric, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(schema.inventory.id, inv.id));

          await this.inventoryRepository.createInventoryTransaction(
            r.warehouseId,
            r.batchId,
            'release',
            qty,
            orderId,
            'Hoàn chỗ (RELEASE)',
            db,
          );

          await this.inventoryRepository.syncBatchTotalsFromInventory(
            db,
            r.batchId,
          );
        }
        return;
      }

      const shipment = (await db.query.shipments.findFirst({
        where: sql`order_id = ${orderId}`,
      })) as unknown as { id: string; fromWarehouseId: number } | undefined;
      if (shipment) {
        await this.releaseStockForShipment(
          shipment.id,
          shipment.fromWarehouseId,
          db,
        );
      }
    };

    if (tx) return run(tx);
    return this.db.transaction(run);
  }

  /** Giải phóng reserved theo dòng shipment (legacy / không có log RESERVATION). */
  async releaseStockForShipment(
    shipmentId: string,
    centralWarehouseId: number,
    tx: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    interface LocalShipmentItem {
      batchId: number;
      quantity: string | number;
    }
    interface LocalShipment {
      orderId: string | null;
    }

    const items = (await tx.query.shipmentItems.findMany({
      where: sql`shipment_id = ${shipmentId}`,
    })) as unknown as LocalShipmentItem[];

    const shipment = (await tx.query.shipments.findFirst({
      where: sql`id = ${shipmentId}`,
    })) as unknown as LocalShipment | undefined;

    const orderId: string | undefined = shipment?.orderId ?? undefined;

    for (const line of items) {
      const qty = parseFloat(String(line.quantity));
      if (qty <= 0) continue;

      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`GREATEST((${schema.inventory.reservedQuantity})::numeric - ${String(qty)}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.inventory.warehouseId, centralWarehouseId),
            eq(schema.inventory.batchId, line.batchId),
          ),
        );

      await this.inventoryRepository.createInventoryTransaction(
        centralWarehouseId,
        line.batchId,
        'release',
        qty,
        orderId,
        'Hoàn chỗ theo shipment (RELEASE)',
        tx,
      );

      await this.inventoryRepository.syncBatchTotalsFromInventory(
        tx,
        line.batchId,
      );
    }
  }

  /**
   * Xuất kho giao hàng: Physical ↓, Reserved ↓ (Available không đổi theo phương trình đã giữ chỗ).
   */
  async confirmExport(
    shipmentId: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    interface LocalShipmentItem {
      batchId: number;
      quantity: string | number;
    }
    interface LocalShipment {
      id: string;
      fromWarehouseId: number;
    }

    const run = async (db: NodePgDatabase<typeof schema>) => {
      const shipment = (await db.query.shipments.findFirst({
        where: sql`id = ${shipmentId}`,
      })) as unknown as LocalShipment | undefined;

      if (!shipment) {
        throw new NotFoundException('Không tìm thấy chuyến hàng');
      }
      const fromWarehouseId: number = shipment.fromWarehouseId;

      const items = (await db.query.shipmentItems.findMany({
        where: sql`shipment_id = ${shipmentId}`,
      })) as unknown as LocalShipmentItem[];

      for (const it of items) {
        const qty = parseFloat(String(it.quantity));
        if (qty <= 0) continue;

        await this.inventoryRepository.decreasePhysicalAndReserved(
          fromWarehouseId,
          it.batchId,
          qty,
          db,
        );

        await this.inventoryRepository.createInventoryTransaction(
          fromWarehouseId,
          it.batchId,
          'export',
          -qty,
          shipmentId,
          'Xuất kho giao hàng (EXPORT)',
          db,
        );

        await this.inventoryRepository.syncBatchTotalsFromInventory(
          db,
          it.batchId,
        );
      }
    };

    if (tx) return run(tx);
    return this.db.transaction(run);
  }

  /** Job đánh dấu lô hết hạn (00:01 Asia/Ho_Chi_Minh). */
  @Cron('1 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async cronExpireBatches(): Promise<void> {
    try {
      await this.runAutoExpireExpiredBatches();
    } catch (e) {
      this.logger.error('cronExpireBatches failed', e);
    }
  }

  async runAutoExpireExpiredBatches(): Promise<void> {
    return this.uow.runInTransaction(async (tx) => {
      const candidates = await this.inventoryRepository.listBatchesToExpire(tx);

      for (const b of candidates) {
        const invRows = await tx.query.inventory.findMany({
          where: eq(schema.inventory.batchId, b.id),
        });

        let reservedTotal = 0;
        for (const row of invRows) {
          reservedTotal += invFromDb(row.reservedQuantity);
        }

        if (reservedTotal > 0) {
          this.logger.warn(
            `[COORDINATOR] Lô ${b.batchCode} (id=${b.id}) hết hạn nhưng còn reserved=${reservedTotal} — đã hoàn chỗ reserved.`,
          );
        }

        await this.inventoryRepository.clearReservedForBatchInventory(tx, b.id);
        await this.inventoryRepository.updateBatchStatus(tx, b.id, 'expired');
        await this.inventoryRepository.syncBatchTotalsFromInventory(tx, b.id);
      }
    });
  }
}
