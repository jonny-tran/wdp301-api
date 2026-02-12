import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import { FinalizeBulkShipmentDto } from './dto/finalize-bulk-shipment.dto';

import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

import { ReportIssueDto } from './dto/report-issue.dto';
import { WarehouseRepository } from './warehouse.repository';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly warehouseRepo: WarehouseRepository,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
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
}
