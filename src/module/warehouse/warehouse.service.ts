import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { UnitOfWork } from '../../database/unit-of-work';
import * as schema from '../../database/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import {
  invFromDb,
  invToDbString,
} from '../inventory/utils/inventory-decimal.util';
import { OrderStatus } from '../order/constants/order-status.enum';
import { OrderRepository } from '../order/order.repository';
import { SystemConfigService } from '../system-config/system-config.service';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { FinalizeBulkShipmentDto } from './dto/finalize-bulk-shipment.dto';

import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

import { ReportIssueDto } from './dto/report-issue.dto';
import { ReportManifestBatchIssueDto } from './dto/report-manifest-batch-issue.dto';
import { VerifyManifestItemDto } from './dto/verify-manifest-item.dto';
import { WarehouseRepository } from './warehouse.repository';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    private readonly warehouseRepo: WarehouseRepository,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly systemConfigService: SystemConfigService,
    private readonly uow: UnitOfWork,
    private readonly inventoryRepository: InventoryRepository,
    private readonly inventoryService: InventoryService,
    private readonly orderRepository: OrderRepository,
  ) {}

  async getCentralWarehouseId(): Promise<number> {
    const warehouse = await this.warehouseRepo.findCentralWarehouseId();
    if (!warehouse) {
      throw new NotFoundException(
        'Không tìm thấy Kho Trung Tâm trong hệ thống.',
      );
    }
    return warehouse.id;
  }

  // --- 1. Tạo kho mặc định ---
  async createDefaultWarehouse(
    storeId: string,
    storeName: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.warehouseRepo.createWarehouse(
      {
        name: `Kho mặc định - ${storeName}`,
        type: 'store_internal',
        storeId: storeId,
      },
      tx,
    );
  }

  // --- 2. GET TASKS ---
  async getTasks(warehouseId: number, query: GetPickingTasksDto) {
    // Note: warehouseId currently unused in repo call as per requirements focused on status/date/search
    return this.warehouseRepo.findApprovedOrders(query);
  }

  // --- 3. GET PICKING LIST ---
  async getPickingList(orderId: string) {
    const shipment = await this.warehouseRepo.findShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found');

    // Logic Grouping dữ liệu để trả về FE
    const groupedItems = new Map<
      number,
      {
        productId: number;
        productName: string;
        requiredQty: number;
        suggestedBatches: {
          batchCode: string;
          qtyToPick: number;
          expiry: string;
        }[];
      }
    >();

    for (const item of shipment.items) {
      const productId = item.batch.productId;
      if (!groupedItems.has(productId)) {
        groupedItems.set(productId, {
          productId: item.batch.productId,
          productName: item.batch.product.name,
          requiredQty: 0,
          suggestedBatches: [],
        });
      }
      const entry = groupedItems.get(productId);
      if (!entry) continue;

      const qty = parseFloat(item.quantity);
      entry.requiredQty += qty;
      entry.suggestedBatches.push({
        batchCode: item.batch.batchCode,
        qtyToPick: qty,
        expiry: item.batch.expiryDate,
      });
    }

    return {
      orderId: orderId,
      shipmentId: shipment.id,
      items: Array.from(groupedItems.values()),
    };
  }

  /**
   * Hủy task soạn bếp: chỉ `approved` / `picking`; hoàn chỗ reserve; shipment → cancelled;
   * đơn → `cancelled` + `cancel_reason`. Transaction ACID.
   */
  async cancelPickingTask(
    orderId: string,
    staffId: string,
    reason: string,
  ): Promise<{ orderId: string; status: OrderStatus }> {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException('Lý do hủy cần ít nhất 3 ký tự');
    }

    await this.getCentralWarehouseId();

    return this.uow.runInTransaction(async (tx) => {
      const order = await this.orderRepository.getOrderById(orderId, tx);
      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }

      const st = order.status as OrderStatus;
      if (st !== OrderStatus.APPROVED && st !== OrderStatus.PICKING) {
        throw new BadRequestException(
          'Chỉ hủy được task soạn khi đơn ở trạng thái approved hoặc picking.',
        );
      }

      const shipment = await this.orderRepository.findShipmentByOrderId(
        orderId,
        tx,
      );

      if (shipment?.manifestId != null) {
        const manifest = await tx.query.manifests.findFirst({
          where: eq(schema.manifests.id, shipment.manifestId),
        });
        if (manifest?.status === 'preparing') {
          throw new BadRequestException(
            'Đơn đang trong manifest đang chuẩn bị. Hãy hủy manifest hoặc liên hệ điều phối trước khi hủy task đơn lẻ.',
          );
        }
      }

      if (shipment && shipment.status !== 'preparing') {
        throw new BadRequestException(
          'Chuyến hàng không còn ở trạng thái preparing — không thể hủy task soạn từ bếp.',
        );
      }

      await this.inventoryService.releaseStock(orderId, tx);

      if (shipment) {
        await tx
          .update(schema.shipments)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.shipments.id, shipment.id));
      }

      await this.orderRepository.updateStatusWithReason(
        orderId,
        OrderStatus.CANCELLED,
        trimmed,
        tx,
      );

      this.logger.log(
        `[cancelPickingTask] orderId=${orderId} staffId=${staffId} reasonPreview=${trimmed.slice(0, 80)}`,
      );

      return { orderId, status: OrderStatus.CANCELLED };
    });
  }

  // --- 5. RESET TASK ---
  async resetPickingTask(orderId: string) {
    const shipment = await this.warehouseRepo.findShipmentByOrderId(orderId);

    if (!shipment)
      throw new NotFoundException('Không tìm thấy phiếu giao hàng');
    if (shipment.status !== 'preparing') {
      throw new BadRequestException(
        'Đơn hàng đã hoàn tất hoặc đang vận chuyển, không thể làm lại.',
      );
    }

    return {
      success: true,
      message: 'Đã đặt lại trạng thái soạn hàng.',
      orderId: orderId,
    };
  }

  // --- 6. FINALIZE SHIPMENT ---

  // --- 7. GET SHIPMENT LABEL ---
  async getShipmentLabel(shipmentId: string) {
    const shipment = await this.warehouseRepo.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Phiếu giao hàng không tồn tại');

    return {
      templateType: 'INVOICE_A4',
      shipmentId: shipment.id,
      date: new Date().toISOString(),
      storeName: shipment.order.store.name,
      items: shipment.items.map((item) => ({
        productName: item.batch.product.name,
        batchCode: item.batch.batchCode,
        qty: item.quantity,
        expiry: item.batch.expiryDate,
      })),
    };
  }

  // --- 8. SCAN BATCH CHECK ---
  async scanBatchCheck(warehouseId: number, batchCode: string) {
    const batchInfo = await this.warehouseRepo.findBatchWithInventory(
      warehouseId,
      batchCode,
    );
    if (!batchInfo)
      throw new NotFoundException('Không tìm thấy thông tin lô hàng này.');

    const inv = batchInfo.inventory[0];
    return {
      productName: batchInfo.product.name,
      batchId: batchInfo.id,
      batchCode: batchInfo.batchCode,
      expiryDate: batchInfo.expiryDate,
      quantityPhysical: inv ? parseFloat(inv.quantity) : 0,
      status:
        inv && parseFloat(inv.quantity) > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    };
  }

  // --- 9. REPORT ISSUE (Sửa lại hoàn chỉnh) ---
  async reportIssue(warehouseId: number, dto: ReportIssueDto) {
    // 1. Validate Inventory
    const inventory = await this.warehouseRepo.findInventory(
      warehouseId,
      dto.batchId,
    );
    if (!inventory) throw new NotFoundException('Lô hàng không có trong kho');

    // 2. Validate Shipment Item
    const shipmentItem = await this.warehouseRepo.findShipmentItemByBatch(
      dto.batchId,
    );
    if (!shipmentItem)
      throw new BadRequestException('Lô hàng không nằm trong đơn đang soạn');

    // 3. Lấy Product ID từ Batch
    const batchInfo = await this.db.query.batches.findFirst({
      where: eq(schema.batches.id, dto.batchId),
    });
    if (!batchInfo) throw new NotFoundException('Batch info corrupted');

    const productId = batchInfo.productId;

    // 4. Gọi Transaction xử lý đổi hàng
    const result = await this.warehouseRepo.replaceDamagedBatchTransaction(
      warehouseId,
      dto,
      shipmentItem,
      productId,
    );

    if (result.remainingToPick > 0) {
      throw new BadRequestException(
        `Không đủ hàng thay thế. Còn thiếu: ${result.remainingToPick}`,
      );
    }

    return {
      message: 'Đã báo cáo sự cố và đổi lô hàng thành công.',
      oldBatchId: dto.batchId,
      replacedWith: result.newAllocations,
    };
  }

  // --- 10. FINALIZE BULK SHIPMENT ---
  async finalizeBulkShipment(
    warehouseId: number,
    dto: FinalizeBulkShipmentDto,
  ) {
    return this.db.transaction(async (tx) => {
      // Loop through each order in the request
      for (const orderDto of dto.orders) {
        // 1. Fetch Order
        const order = await tx.query.orders.findFirst({
          where: eq(schema.orders.id, orderDto.orderId),
        });

        if (!order) {
          throw new NotFoundException(
            `Không tìm thấy đơn hàng với ID ${orderDto.orderId}`,
          );
        }

        // Optional: Check if order is already processed to prevent double decrement?
        if (order.status !== (OrderStatus.APPROVED as any)) {
          throw new BadRequestException(
            `Đơn hàng ${order.id} không ở trạng thái APPROVED.`,
          );
        }

        const shipmentRow = await tx.query.shipments.findFirst({
          where: eq(schema.shipments.orderId, orderDto.orderId),
        });
        if (shipmentRow?.manifestId != null) {
          throw new BadRequestException(
            'Đơn đã gán vào chuyến manifest. Hãy dùng xác nhận xuất kho khi xe rời kho (POST /warehouse/manifests/:id/depart).',
          );
        }

        // 2. Loop Picked Items & Validate
        for (const item of orderDto.pickedItems) {
          const batch = await tx.query.batches.findFirst({
            where: eq(schema.batches.id, item.batchId),
          });

          if (!batch) {
            throw new NotFoundException(
              `Không tìm thấy lô hàng với ID ${item.batchId} trong đơn ${orderDto.orderId}`,
            );
          }

          // 3. Business Rule: Expiry Date check
          const expiryDate = new Date(batch.expiryDate).getTime();
          const deliveryDate = new Date(order.deliveryDate).getTime();

          if (expiryDate <= deliveryDate) {
            throw new BadRequestException(
              `Lô hàng ${batch.batchCode} hết hạn (${batch.expiryDate}) trước hoặc trong ngày giao hàng (${
                new Date(order.deliveryDate).toISOString().split('T')[0]
              }) của đơn ${order.id}.`,
            );
          }

          // 4. Stock Management
          await this.warehouseRepo.decreaseStockFinal(
            warehouseId,
            item.batchId,
            item.quantity,
            tx,
          );

          // 5. Audit Log
          await tx.insert(schema.inventoryTransactions).values({
            warehouseId,
            batchId: item.batchId,
            type: 'export',
            quantityChange: (-item.quantity).toString(),
            referenceId: orderDto.orderId,
            reason: 'Bulk Fulfillment',
          });

          // ========================================
          // BUSINESS RULE: FEFO_STRICT_MODE CHECK
          // Verify no older batch (earlier expiry) has available stock
          // ========================================
          await this.enforceFEFOStrictMode(
            warehouseId,
            batch.productId,
            batch.expiryDate,
            batch.batchCode,
            tx,
          );
        }

        // 6. Update Shipment Status
        const shipment = await tx.query.shipments.findFirst({
          where: eq(schema.shipments.orderId, orderDto.orderId),
        });

        if (shipment) {
          await tx
            .update(schema.shipments)
            .set({ status: 'in_transit', shipDate: new Date() })
            .where(eq(schema.shipments.id, shipment.id));
        }

        // 7. Update Order Status
        await tx
          .update(schema.orders)
          .set({
            status: OrderStatus.DELIVERING,
            updatedAt: new Date(),
          })
          .where(eq(schema.orders.id, orderDto.orderId));
      }

      return { message: 'Consolidated fulfillment successful' };
    });
  }

  // --- WH-OPTIMIZE: Manifest / wave picking / xuất kho theo xe ---

  async createManifest(dto: CreateManifestDto) {
    const centralId = await this.getCentralWarehouseId();
    const uniqueOrderIds = [...new Set(dto.orderIds)];
    if (uniqueOrderIds.length !== dto.orderIds.length) {
      throw new BadRequestException('Danh sách đơn không được trùng lặp.');
    }

    return this.uow.runInTransaction(async (tx) => {
      const orders = await tx.query.orders.findMany({
        where: inArray(schema.orders.id, uniqueOrderIds),
      });
      if (orders.length !== uniqueOrderIds.length) {
        throw new NotFoundException('Một hoặc nhiều đơn hàng không tồn tại.');
      }
      for (const o of orders) {
        if (o.status !== OrderStatus.APPROVED) {
          throw new BadRequestException(
            `Đơn ${o.id} không ở trạng thái đã duyệt (approved).`,
          );
        }
      }

      const shipments = await this.warehouseRepo.findShipmentsReadyForManifest(
        uniqueOrderIds,
        centralId,
        tx,
      );
      if (shipments.length !== uniqueOrderIds.length) {
        throw new BadRequestException(
          'Thiếu phiếu giao preparing, hoặc đơn không cùng kho trung tâm / đã gán manifest.',
        );
      }

      const code = `MAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const [manifest] = await tx
        .insert(schema.manifests)
        .values({
          code,
          driverName: dto.driverName ?? null,
          vehiclePlate: dto.vehiclePlate ?? null,
          status: 'preparing',
        })
        .returning();

      for (const sh of shipments) {
        await tx
          .update(schema.shipments)
          .set({ manifestId: manifest.id, updatedAt: new Date() })
          .where(eq(schema.shipments.id, sh.id));
      }

      for (const sh of shipments) {
        for (const it of sh.items) {
          await tx
            .update(schema.shipmentItems)
            .set({ suggestedBatchId: it.batchId })
            .where(eq(schema.shipmentItems.id, it.id));
        }
      }

      const [pickingList] = await tx
        .insert(schema.pickingLists)
        .values({ manifestId: manifest.id, status: 'open' })
        .returning();

      const byProduct = new Map<number, number>();
      for (const sh of shipments) {
        for (const it of sh.items) {
          const pid = it.batch.productId;
          const q = invFromDb(it.quantity);
          byProduct.set(pid, (byProduct.get(pid) ?? 0) + q);
        }
      }

      for (const [productId, qty] of byProduct) {
        await tx.insert(schema.pickingListItems).values({
          pickingListId: pickingList.id,
          productId,
          totalPlannedQuantity: invToDbString(qty),
          totalPickedQuantity: '0',
        });
      }

      return {
        manifestId: manifest.id,
        code: manifest.code,
        pickingListId: pickingList.id,
        orderCount: shipments.length,
        aggregatedProductLines: byProduct.size,
      };
    });
  }

  async getManifestPickingList(manifestId: number) {
    await this.uow.runInTransaction(async (tx) => {
      await this.warehouseRepo.syncPickingListPickedTotals(manifestId, tx);
    });
    const m = await this.warehouseRepo.findManifestById(manifestId);
    if (!m) {
      throw new NotFoundException('Không tìm thấy manifest.');
    }
    return {
      manifestId: m.id,
      code: m.code,
      status: m.status,
      driverName: m.driverName,
      vehiclePlate: m.vehiclePlate,
      pickingList: m.pickingList
        ? {
            id: m.pickingList.id,
            status: m.pickingList.status,
            items: m.pickingList.items.map((row) => ({
              id: row.id,
              productId: row.productId,
              productName: row.product.name,
              unit: row.product.baseUnit?.name,
              totalPlannedQuantity: row.totalPlannedQuantity,
              totalPickedQuantity: row.totalPickedQuantity,
            })),
          }
        : null,
      shipments: m.shipments.map((sh) => ({
        shipmentId: sh.id,
        orderId: sh.orderId,
        storeName: sh.order?.store?.name,
        items: sh.items.map((it) => ({
          shipmentItemId: it.id,
          productName: it.batch.product.name,
          quantity: it.quantity,
          suggestedBatchId: it.suggestedBatchId ?? it.batchId,
          suggestedBatchCode: it.suggestedBatch?.batchCode ?? it.batch.batchCode,
          actualBatchId: it.actualBatchId,
        })),
      })),
    };
  }

  async verifyManifestItem(manifestId: number, dto: VerifyManifestItemDto) {
    return this.uow.runInTransaction(async (tx) => {
      const item = await this.warehouseRepo.findShipmentItemById(
        dto.shipmentItemId,
        tx,
      );
      if (!item) {
        throw new NotFoundException('Không tìm thấy dòng shipment.');
      }
      const shipment = await tx.query.shipments.findFirst({
        where: eq(schema.shipments.id, item.shipmentId),
      });
      if (!shipment || shipment.manifestId !== manifestId) {
        throw new BadRequestException('Dòng hàng không thuộc manifest này.');
      }
      const suggested = item.suggestedBatchId ?? item.batchId;
      if (dto.scannedBatchId !== suggested) {
        throw new ForbiddenException(
          'Sai lô hàng! Bạn phải lấy lô cũ nhất theo chỉ định.',
        );
      }
      await tx
        .update(schema.shipmentItems)
        .set({ actualBatchId: dto.scannedBatchId })
        .where(eq(schema.shipmentItems.id, item.id));

      await tx
        .update(schema.pickingLists)
        .set({ status: 'picking' })
        .where(eq(schema.pickingLists.manifestId, manifestId));

      await this.warehouseRepo.syncPickingListPickedTotals(manifestId, tx);
      return { success: true };
    });
  }

  async reportManifestBatchIssue(
    manifestId: number,
    dto: ReportManifestBatchIssueDto,
  ) {
    const centralId = await this.getCentralWarehouseId();
    return this.uow.runInTransaction(async (tx) => {
      const m = await tx.query.manifests.findFirst({
        where: eq(schema.manifests.id, manifestId),
      });
      if (!m) {
        throw new NotFoundException('Không tìm thấy manifest.');
      }
      if (m.status !== 'preparing') {
        throw new BadRequestException(
          'Chỉ báo hỏng lô khi manifest đang chuẩn bị.',
        );
      }

      const item = await this.warehouseRepo.findShipmentItemById(
        dto.shipmentItemId,
        tx,
      );
      if (!item) {
        throw new NotFoundException('Không tìm thấy dòng shipment.');
      }
      const shipment = await tx.query.shipments.findFirst({
        where: eq(schema.shipments.id, item.shipmentId),
      });
      if (!shipment || shipment.manifestId !== manifestId) {
        throw new BadRequestException('Dòng hàng không thuộc manifest này.');
      }

      const suggested = item.suggestedBatchId ?? item.batchId;
      if (dto.batchId !== suggested) {
        throw new BadRequestException(
          'Chỉ báo hỏng đúng lô đang được hệ thống chỉ định.',
        );
      }

      const productId = item.batch.productId;
      const result = await this.warehouseRepo.replaceDamagedBatchTransaction(
        centralId,
        { batchId: dto.batchId },
        {
          id: item.id,
          quantity: String(item.quantity),
          shipmentId: item.shipmentId,
        },
        productId,
        tx,
      );

      if (result.remainingToPick > 0) {
        throw new BadRequestException(
          `Không đủ hàng thay thế. Còn thiếu: ${result.remainingToPick}`,
        );
      }

      await this.inventoryRepository.updateBatchStatus(tx, dto.batchId, 'damaged');

      await this.warehouseRepo.syncPickingListPickedTotals(manifestId, tx);

      return {
        message: `Đã báo hỏng lô và chỉ định lô mới. Lý do: ${dto.reason}`,
        replacedWith: result.newAllocations,
      };
    });
  }

  async confirmManifestDeparture(manifestId: number) {
    return this.uow.runInTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${manifestId}::bigint)`,
      );

      const m = await tx.query.manifests.findFirst({
        where: eq(schema.manifests.id, manifestId),
      });
      if (!m) {
        throw new NotFoundException('Không tìm thấy manifest.');
      }
      if (m.status !== 'preparing') {
        throw new BadRequestException(
          'Manifest không thể xuất ở trạng thái hiện tại.',
        );
      }

      const shipments = await tx.query.shipments.findMany({
        where: eq(schema.shipments.manifestId, manifestId),
        with: { items: true },
      });

      for (const sh of shipments) {
        for (const it of sh.items) {
          if (it.actualBatchId == null) {
            throw new BadRequestException(
              'Chưa quét đủ tất cả lô hàng theo chỉ định trước khi xe rời kho.',
            );
          }
        }
      }

      for (const sh of shipments) {
        const fromWarehouseId = sh.fromWarehouseId;
        for (const it of sh.items) {
          const qty = invFromDb(it.quantity);
          const batchId = it.batchId;

          await this.inventoryRepository.decreasePhysicalAndReserved(
            fromWarehouseId,
            batchId,
            qty,
            tx,
          );

          await this.inventoryRepository.createInventoryTransaction(
            fromWarehouseId,
            batchId,
            'export',
            -qty,
            sh.id,
            'Xuất kho theo manifest (EXPORT)',
            tx,
          );

          await this.inventoryRepository.syncBatchTotalsFromInventory(
            tx,
            batchId,
          );
        }

        await tx
          .update(schema.shipments)
          .set({
            status: 'in_transit',
            shipDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.shipments.id, sh.id));

        await tx
          .update(schema.orders)
          .set({ status: OrderStatus.DELIVERING, updatedAt: new Date() })
          .where(eq(schema.orders.id, sh.orderId));
      }

      await tx
        .update(schema.manifests)
        .set({
          status: 'departed',
          departureAt: new Date(),
        })
        .where(eq(schema.manifests.id, manifestId));

      const pl = await tx.query.pickingLists.findFirst({
        where: eq(schema.pickingLists.manifestId, manifestId),
      });
      if (pl) {
        await tx
          .update(schema.pickingLists)
          .set({ status: 'completed' })
          .where(eq(schema.pickingLists.id, pl.id));
      }

      return { message: 'Đã xác nhận xe rời kho và trừ tồn kho.' };
    });
  }

  async cancelManifest(manifestId: number) {
    const centralId = await this.getCentralWarehouseId();
    return this.uow.runInTransaction(async (tx) => {
      const m = await tx.query.manifests.findFirst({
        where: eq(schema.manifests.id, manifestId),
      });
      if (!m) {
        throw new NotFoundException('Không tìm thấy manifest.');
      }
      if (m.status !== 'preparing') {
        throw new BadRequestException('Chỉ hủy manifest đang chuẩn bị.');
      }

      const shipments = await tx.query.shipments.findMany({
        where: eq(schema.shipments.manifestId, manifestId),
      });

      for (const sh of shipments) {
        await this.inventoryService.releaseStockForShipment(
          sh.id,
          centralId,
          tx,
        );
      }

      for (const sh of shipments) {
        await tx
          .update(schema.shipments)
          .set({ manifestId: null, updatedAt: new Date() })
          .where(eq(schema.shipments.id, sh.id));
      }

      await tx
        .update(schema.manifests)
        .set({ status: 'cancelled' })
        .where(eq(schema.manifests.id, manifestId));

      return { message: 'Đã hủy manifest và hoàn chỗ trên tồn kho.' };
    });
  }

  // =============================================
  // PRIVATE: FEFO Strict Mode Enforcement
  // =============================================

  /**
   * Kiểm tra FEFO_STRICT_MODE: nếu enabled, chặn xuất lô mới khi còn lô cũ hơn
   * có hàng. Nếu disabled, chỉ log warning.
   */
  private async enforceFEFOStrictMode(
    warehouseId: number,
    productId: number,
    currentBatchExpiry: string,
    currentBatchCode: string,
    tx: NodePgDatabase<typeof schema>,
  ): Promise<void> {
    // Query for older batches (earlier expiry) with available stock
    const olderBatches = await tx
      .select({
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
        availableQty: sql<number>`(${schema.inventory.quantity} - ${schema.inventory.reservedQuantity})`,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.batches.productId, productId),
          // Expiry date earlier than the batch being picked
          lt(schema.batches.expiryDate, currentBatchExpiry),
          // Still has available stock
          sql`(${schema.inventory.quantity} - ${schema.inventory.reservedQuantity}) > 0`,
          // Not expired
          sql`${schema.batches.expiryDate}::date > CURRENT_DATE`,
        ),
      )
      .orderBy(asc(schema.batches.expiryDate))
      .limit(1);

    if (olderBatches.length === 0) return; // No FEFO violation

    const olderBatch = olderBatches[0];
    const fefoStrictMode =
      await this.systemConfigService.getConfigValue('FEFO_STRICT_MODE');

    const warningMsg =
      `Vi phạm FEFO: Đang xuất lô ${currentBatchCode} (HSD: ${currentBatchExpiry}) ` +
      `nhưng lô ${olderBatch.batchCode} (HSD: ${olderBatch.expiryDate}, ` +
      `còn ${olderBatch.availableQty}) cần xuất trước.`;

    if (fefoStrictMode === 'TRUE') {
      throw new BadRequestException(warningMsg);
    } else {
      // FEFO_STRICT_MODE = FALSE → chỉ log warning, cho phép tiếp tục
      this.logger.warn(`[FEFO_WARNING] ${warningMsg}`);
    }
  }
}
