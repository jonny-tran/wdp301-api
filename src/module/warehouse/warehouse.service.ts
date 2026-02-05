import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import {
  FinalizeShipmentDto,
  PickItemDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // =================================================================
  // INTERNAL: Tạo kho mặc định cho Store (Transactional)
  // =================================================================
  async createDefaultWarehouse(
    storeId: string,
    storeName: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const db = tx ?? this.db;
    const warehouseName = `Kho mặc định - ${storeName}`;

    const [warehouse] = await db
      .insert(schema.warehouses)
      .values({
        name: warehouseName,
        type: 'store_internal',
        storeId: storeId,
      })
      .returning();

    return warehouse;
  }

  // =================================================================
  // API 1: Lấy danh sách nhiệm vụ (Tasks)
  // =================================================================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTasks(warehouseId: number, date: string | undefined) {
    return this.db.query.orders.findMany({
      where: eq(schema.orders.status, OrderStatus.APPROVED),
      with: {
        store: true,
      },
      orderBy: [asc(schema.orders.deliveryDate)],
    });
  }

  // =================================================================
  // API 2: Lấy Picking List (Gợi ý FEFO)
  // =================================================================
  async getPickingList(orderId: string) {
    const shipment = await this.db.query.shipments.findFirst({
      where: eq(schema.shipments.orderId, orderId),
      with: {
        items: {
          with: {
            batch: { with: { product: true } },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(
        'Không tìm thấy chuyến hàng cho đơn hàng này',
      );
    }

    const groupedItems = new Map<
      number,
      {
        product_name: string;
        required_qty: number;
        suggested_batches: {
          batch_code: string;
          qty_to_pick: number;
          expiry: string;
        }[];
      }
    >();

    for (const item of shipment.items) {
      const productId = item.batch.productId;
      if (!groupedItems.has(productId)) {
        groupedItems.set(productId, {
          product_name: item.batch.product.name,
          required_qty: 0,
          suggested_batches: [],
        });
      }

      const entry = groupedItems.get(productId);
      if (!entry) {
        throw new InternalServerErrorException(
          'Lỗi khi xử lý nhóm các mặt hàng',
        );
      }

      const qty = parseFloat(item.quantity);
      entry.required_qty += qty;
      entry.suggested_batches.push({
        batch_code: item.batch.batchCode,
        qty_to_pick: qty,
        expiry: item.batch.expiryDate,
      });
    }

    return {
      order_id: orderId,
      items: Array.from(groupedItems.values()),
    };
  }

  // =================================================================
  // API 3: Báo cáo Lô lỗi & Đổi lô (Report Issue)
  // =================================================================
  async reportIssue(warehouseId: number, dto: ReportIssueDto) {
    return this.db.transaction(async (tx) => {
      // 1. Kiểm tra Inventory
      const inventory = await tx.query.inventory.findFirst({
        where: and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, dto.batch_id),
        ),
      });

      if (!inventory) {
        throw new NotFoundException('Không tìm thấy lô hàng trong kho');
      }

      // 2. Tìm Shipment Item đang giữ lô này
      const shipmentItem = await tx.query.shipmentItems.findFirst({
        where: eq(schema.shipmentItems.batchId, dto.batch_id),
      });

      if (!shipmentItem) {
        throw new BadRequestException(
          'Lô hàng không nằm trong danh sách chọn hàng nào đang hoạt động',
        );
      }

      const qtyNeeded = parseFloat(shipmentItem.quantity);
      const shipmentId = shipmentItem.shipmentId;

      // --- FIX LỖI 1: Tách việc lấy Batch ra và kiểm tra tồn tại ---
      const batch = await tx.query.batches.findFirst({
        where: eq(schema.batches.id, dto.batch_id),
      });

      if (!batch) {
        throw new NotFoundException('Lỗi tính toàn vẹn dữ liệu lô hàng');
      }
      const productId = batch.productId;
      // -------------------------------------------------------------

      // 3. Xóa Shipment Item cũ (Gỡ lô hỏng ra khỏi đơn)
      await tx
        .delete(schema.shipmentItems)
        .where(eq(schema.shipmentItems.id, shipmentItem.id));

      // 4. Giảm Reserved Qty của lô hỏng
      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qtyNeeded}`,
        })
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.inventory.batchId, dto.batch_id),
          ),
        );

      // 5. Tìm Lô thay thế (Re-run FEFO logic)
      const candidateBatches = await tx
        .select()
        .from(schema.inventory)
        .innerJoin(
          schema.batches,
          eq(schema.inventory.batchId, schema.batches.id),
        )
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.batches.productId, productId),
            // Tránh lấy lại lô vừa báo lỗi
            sql`${schema.inventory.batchId} != ${dto.batch_id}`,
            // Available > 0
            sql`(${schema.inventory.quantity} - ${schema.inventory.reservedQuantity}) > 0`,
          ),
        )
        .orderBy(asc(schema.batches.expiryDate));

      let remainingToPick = qtyNeeded;

      // --- FIX LỖI 2: Định nghĩa kiểu dữ liệu rõ ràng cho mảng ---
      const newAllocations: { batch: string; qty: number }[] = [];
      // ----------------------------------------------------------

      for (const candidate of candidateBatches) {
        if (remainingToPick <= 0) break;
        const available =
          parseFloat(candidate.inventory.quantity) -
          parseFloat(candidate.inventory.reservedQuantity);
        const take = Math.min(available, remainingToPick);

        // Tạo shipment item mới
        await tx.insert(schema.shipmentItems).values({
          shipmentId: shipmentId,
          batchId: candidate.batches.id,
          quantity: take.toString(),
        });

        // Update Reserved cho lô mới
        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${take}`,
          })
          .where(eq(schema.inventory.id, candidate.inventory.id));

        newAllocations.push({
          batch: candidate.batches.batchCode,
          qty: take,
        });

        remainingToPick -= take;
      }

      if (remainingToPick > 0) {
        throw new BadRequestException(
          `Không đủ hàng trong kho để thay thế lô bị hỏng. Còn thiếu: ${remainingToPick}`,
        );
      }

      return {
        message: 'Đã báo cáo sự cố. Lô hàng đã được thay thế thành công.',
        old_batch_id: dto.batch_id,
        replaced_with: newAllocations,
      };
    });
  }

  // =================================================================
  // API 4: Hoàn tất giao hàng (Final Deduction)
  // =================================================================
  async finalizeShipment(warehouseId: number, dto: FinalizeShipmentDto) {
    return this.db.transaction(async (tx) => {
      const shipment = await tx.query.shipments.findFirst({
        where: eq(schema.shipments.orderId, dto.order_id),
        with: { items: true },
      });

      if (!shipment) throw new NotFoundException('Không tìm thấy chuyến hàng');
      if (shipment.status !== 'preparing') {
        throw new BadRequestException(
          'Chuyến hàng này đã được hoàn tất trước đó',
        );
      }

      for (const item of shipment.items) {
        const qty = parseFloat(item.quantity);
        await tx
          .update(schema.inventory)
          .set({
            quantity: sql`${schema.inventory.quantity} - ${qty}`,
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.inventory.warehouseId, warehouseId),
              eq(schema.inventory.batchId, item.batchId),
            ),
          );

        await tx.insert(schema.inventoryTransactions).values({
          warehouseId,
          batchId: item.batchId,
          type: 'export',
          quantityChange: (-qty).toString(),
          referenceId: shipment.id,
          reason: 'Xuất kho giao hàng',
        });
      }

      await tx
        .update(schema.shipments)
        .set({ status: 'in_transit', shipDate: new Date() })
        .where(eq(schema.shipments.id, shipment.id));

      await tx
        .update(schema.orders)
        .set({ status: OrderStatus.DELIVERING })
        .where(eq(schema.orders.id, dto.order_id));

      return {
        success: true,
        message: 'Đã hoàn tất chuyến hàng và trừ tồn kho thành công.',
      };
    });
  }

  // --- 3. POST PICK ITEM ( Validate FEFO Enforcement) ---
  async validatePickItem(warehouseId: number, dto: PickItemDto) {
    // Logic: Tìm tất cả lô của Product này trong kho, sắp xếp theo HSD.
    // Lô scan phải nằm trong nhóm "Hết hạn sớm nhất" (có thể có nhiều lô cùng ngày hết hạn).
    // 1. Lấy thông tin Lô vừa quét
    const scannedBatch = await this.db.query.batches.findFirst({
      where: eq(schema.batches.batchCode, dto.batch_code),
    });
    if (!scannedBatch)
      throw new NotFoundException('Mã lô không tồn tại trong hệ thống');
    if (scannedBatch.productId !== dto.product_id)
      throw new BadRequestException('Mã lô không thuộc sản phẩm này');

    // 2. Lấy danh sách Lô khả dụng (FEFO) của sản phẩm đó trong kho
    const availableBatches = await this.db
      .select({
        batchId: schema.batches.id,
        batchCode: schema.batches.batchCode,
        expiryDate: schema.batches.expiryDate,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.batches,
        eq(schema.inventory.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.batches.productId, dto.product_id),
          gt(schema.inventory.quantity, '0'), // Còn hàng
        ),
      )
      .orderBy(asc(schema.batches.expiryDate));

    if (availableBatches.length === 0) {
      throw new BadRequestException('Kho đã hết sạch sản phẩm này');
    }

    // 3. So sánh: Lô quét có phải là lô đầu tiên (hoặc có date bằng lô đầu tiên) không?
    const bestBatch = availableBatches[0];
    const scannedDate = new Date(scannedBatch.expiryDate).getTime();
    const bestDate = new Date(bestBatch.expiryDate).getTime();

    // Cho phép sai số nhỏ hoặc cùng ngày
    if (scannedDate > bestDate) {
      // Nếu lô quét mới hơn lô gợi ý -> Chặn
      throw new ForbiddenException(
        `Vi phạm quy tắc FEFO! Hệ thống yêu cầu lấy lô ${bestBatch.batchCode} (HSD: ${bestBatch.expiryDate}) trước.`,
      );
    }

    return {
      valid: true,
      message: 'Mã lô hợp lệ. Đã xác nhận.',
      batch_code: dto.batch_code,
      scanned_qty: dto.quantity,
    };
  }

  // --- 4. PATCH RESET (Xóa trạng thái soạn hàng) ---
  // async resetPickingTask(orderId: string, warehouseId: number, reason: string) {
  // async resetPickingTask(orderId: string, p0: number, reason: string) {
  async resetPickingTask(orderId: string) {
    // Trong mô hình hiện tại, chúng ta không lưu "Picking Session" vào DB tạm.
    // Nhưng chúng ta cần đảm bảo đơn chưa Finalize mới được Reset.
    const shipment = await this.db.query.shipments.findFirst({
      where: eq(schema.shipments.orderId, orderId),
    });

    if (!shipment)
      throw new NotFoundException('Không tìm thấy phiếu giao hàng');
    if (shipment.status !== 'preparing') {
      throw new BadRequestException(
        'Đơn hàng đã hoàn tất hoặc đang vận chuyển, không thể làm lại.',
      );
    }

    // Ghi log hành động Reset (Optional)
    // await this.auditLogService.log('RESET_PICKING', { orderId, reason, by: warehouseId });

    return {
      success: true,
      message: 'Đã đặt lại trạng thái soạn hàng. Vui lòng quét lại từ đầu.',
      order_id: orderId,
    };
  }
  // --- 6. GET SHIPMENT LABEL ( Dữ liệu in phiếu) ---
  async getShipmentLabel(shipmentId: string) {
    const shipment = await this.db.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
      with: {
        order: { with: { store: true } },
        items: {
          with: {
            batch: { with: { product: true } },
          },
        },
      },
    });

    if (!shipment) throw new NotFoundException('Phiếu giao hàng không tồn tại');

    // Transform data cho mẫu in
    return {
      template_type: 'INVOICE_A4',
      shipment_id: shipment.id,
      date: new Date().toISOString(),
      store_name: shipment.order.store.name,
      store_address: shipment.order.store.address,
      items: shipment.items.map((item) => ({
        product: item.batch.product.name,
        sku: item.batch.product.sku,
        batch_code: item.batch.batchCode,
        qty: item.quantity,
        unit: item.batch.product.baseUnit,
        expiry: item.batch.expiryDate,
      })),
      total_items: shipment.items.length,
    };
  }

  // --- 7. GET SCAN CHECK (Tiện ích tra cứu) ---
  async scanBatchCheck(warehouseId: number, batchCode: string) {
    const batchInfo = await this.db.query.batches.findFirst({
      where: eq(schema.batches.batchCode, batchCode),
      with: {
        product: true,
        inventory: {
          where: eq(schema.inventory.warehouseId, warehouseId),
        },
      },
    });

    if (!batchInfo)
      throw new NotFoundException('Không tìm thấy thông tin lô hàng này.');

    const inv = batchInfo.inventory[0]; // Lấy tồn kho tại kho hiện tại

    return {
      product_name: batchInfo.product.name,
      sku: batchInfo.product.sku,
      batch_code: batchInfo.batchCode,
      expiry_date: batchInfo.expiryDate,
      quantity_physical: inv ? parseFloat(inv.quantity) : 0,
      quantity_reserved: inv ? parseFloat(inv.reservedQuantity) : 0,
      status:
        inv && parseFloat(inv.quantity) > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    };
  }
}
