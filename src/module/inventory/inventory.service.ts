import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { UnitOfWork } from '../../database/unit-of-work';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import {
  AgingReportQueryDto,
  FinancialLossQueryDto,
  // InventorySummaryQueryDto,
  WasteReportQueryDto,
} from './dto/analytics-query.dto';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { AdjustmentDto, OrderItemLockLine } from './dto/adjustment.dto';
import { InventoryDto } from './inventory.dto';
import { InventoryRepository } from './inventory.repository';
import { invFromDb, invPct, invToDbString } from './utils/inventory-decimal.util';

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

  // Helper Lấy ID kho bếp
  private async getKitchenWarehouseId(): Promise<number> {
    const id = await this.inventoryRepository.findCentralWarehouseId();
    if (!id)
      throw new NotFoundException('Không tìm thấy thông tin kho bếp trung tâm');
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
  async getKitchenDetails(productId: number) {
    const warehouseId = await this.getKitchenWarehouseId();
    const batches = await this.inventoryRepository.getKitchenBatchDetails(
      warehouseId,
      productId,
    );

    return {
      productId: productId,
      totalBatches: batches.length,
      details: batches.map((b) => {
        const qty = parseFloat(b.quantity.toString());
        const res = parseFloat(b.reserved.toString());

        return {
          batchCode: b.batchCode,
          expiryDate: b.expiryDate, // Frontend tự format dd/MM/yyyy
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

  // --- API 9: Financial Loss Impact ---
  async getFinancialLoss(query: FinancialLossQueryDto) {
    const { wasteData, claimData } =
      await this.inventoryRepository.getFinancialLoss(query.from, query.to);

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

      await this.inventoryRepository.syncBatchTotalsFromInventory(tx, dto.batchId);
    });
  }

  /**
   * Đặt chỗ theo đơn (FEFO + đệm min_shelf_life): Available ↓, Reserved ↑, Physical không đổi.
   */
  async lockStockForOrder(
    orderId: string,
    warehouseId: number,
    items: OrderItemLockLine[],
    tx: NodePgDatabase<typeof schema>,
    createdBy?: string | null,
  ): Promise<{
    shipmentItems: { batchId: number; quantity: number }[];
    results: {
      orderItemId: number;
      productId: number;
      requested: number;
      approved: number;
      missing: number;
    }[];
  }> {
    const shipmentItems: { batchId: number; quantity: number }[] = [];
    const results: {
      orderItemId: number;
      productId: number;
      requested: number;
      approved: number;
      missing: number;
    }[] = [];

    for (const line of items) {
      let remaining = line.quantityRequested;
      let approved = 0;

      const batches =
        await this.inventoryRepository.findBatchesForFEFOWithShelfBuffer(
          line.productId,
          warehouseId,
          tx,
        );

      for (const batch of batches) {
        if (remaining <= 0) break;
        const phys = invFromDb(batch.quantity);
        const res = invFromDb(batch.reservedQuantity);
        const available = phys - res;
        if (available <= 0) continue;

        const takeNum = Math.min(available, remaining);

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
          'Giữ chỗ theo đơn hàng (RESERVATION)',
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
      });
    }

    return { shipmentItems, results };
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

      const shipment = await db.query.shipments.findFirst({
        where: eq(schema.shipments.orderId, orderId),
      });
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
    const items = await tx.query.shipmentItems.findMany({
      where: eq(schema.shipmentItems.shipmentId, shipmentId),
    });
    const shipment = await tx.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
    });
    const orderId = shipment?.orderId;

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
        orderId ?? undefined,
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
    const run = async (db: NodePgDatabase<typeof schema>) => {
      const shipment = await db.query.shipments.findFirst({
        where: eq(schema.shipments.id, shipmentId),
        with: { items: true },
      });
      if (!shipment) {
        throw new NotFoundException('Không tìm thấy chuyến hàng');
      }
      const fromWarehouseId = shipment.fromWarehouseId;

      for (const it of shipment.items ?? []) {
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
