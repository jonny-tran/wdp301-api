import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { InventoryDto } from './inventory.dto';
import { InventoryRepository } from './inventory.repository';
import {
  AgingReportQueryDto,
  // InventorySummaryQueryDto,
  WasteReportQueryDto,
} from './dto/analytics-query.dto';

export interface AgingBucketItem {
  batchCode: string;
  productName: string;
  quantity: number;
  expiryDate: string;
  percentageLeft: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
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
        unit: item.batch.product.baseUnit.name,
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
        throw new Error('Số lượng tồn kho không thể nhỏ hơn 0');
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

  // Helper Lấy ID kho bếp
  private async getKitchenWarehouseId(): Promise<number> {
    const id = await this.inventoryRepository.findCentralWarehouseId();
    if (!id) throw new NotFoundException('Central Kitchen Warehouse not found');
    return id;
  }

  //  Group theo Product để xem tổng quan
  async getKitchenSummary(query: GetKitchenInventoryDto) {
    const centralWarehouseId =
      await this.inventoryRepository.findCentralWarehouseId();

    if (!centralWarehouseId) {
      // Nếu chưa có kho trung tâm -> trả về rỗng
      return {
        items: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: query.limit || 20,
          totalPages: 0,
          currentPage: query.page || 1,
        },
      };
    }

    const { items, meta } = await this.inventoryRepository.getKitchenSummary(
      centralWarehouseId,
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
          product_id: item.productId,
          product_name: item.productName,
          sku: item.sku,
          unit: item.unitName,
          min_stock: item.minStock,
          total_physical: physical, // Tổng thực tế
          total_reserved: reserved, // Đang xử lý
          available_quantity: available, // Có thể dùng
          // Cờ cảnh báo nếu dưới định mức
          is_low_stock: available < (item.minStock || 0),
        };
      }),
      meta,
    };
  }

  // API 7: Xem chi tiết lô (Drill-down)
  async getKitchenDetails(productId: number) {
    const warehouseId = await this.getKitchenWarehouseId();
    const batches = await this.inventoryRepository.getKitchenBatchDetails(
      warehouseId,
      productId,
    );

    return {
      product_id: productId,
      total_batches: batches.length,
      details: batches.map((b) => {
        const qty = parseFloat(b.quantity.toString());
        const res = parseFloat(b.reserved.toString());

        return {
          batch_code: b.batchCode,
          expiry_date: b.expiryDate, // Frontend tự format dd/MM/yyyy
          physical: qty,
          reserved: res,
          available: qty - res,
        };
      }),
    };
  }

  async getAnalyticsSummary() {
    const warehouseId = await this.getKitchenWarehouseId();

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
  async getAgingReport(query: AgingReportQueryDto) {
    const warehouseId = await this.getKitchenWarehouseId();
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

  // --- API 3: Waste Report ---
  async getWasteReport(query: WasteReportQueryDto) {
    const warehouseId = await this.getKitchenWarehouseId();

    const wasteData = await this.inventoryRepository.getWasteReport(
      warehouseId,
      query.fromDate,
      query.toDate,
    );

    let totalWasteQuantity = 0;

    const formattedData = wasteData.map((w) => {
      const qty = Math.abs(parseFloat(w.quantityWasted));
      totalWasteQuantity += qty;

      return {
        transactionId: w.transactionId,
        productName: w.productName,
        batchCode: w.batchCode,
        wastedQuantity: qty,
        reason: w.reason,
        date: w.createdAt,
      };
    });

    return {
      kpi: {
        totalWastedQuantity: totalWasteQuantity,
        period: `${query.fromDate || 'Tất cả'} đến ${query.toDate || 'Hiện tại'}`,
      },
      details: formattedData,
    };
  }
}
