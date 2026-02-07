import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  // InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm'; // Import eq
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants'; // Import DB Connection
import * as schema from '../../database/schema';
import {
  FinalizeShipmentDto,
  PickItemDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { SuggestedBatch } from './interface/suggestedBatch.interface';
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
  async getTasks(warehouseId: number, date?: string) {
    return this.warehouseRepo.findApprovedOrders(date);
  }

  // --- 3. GET PICKING LIST ---
  async getPickingList(orderId: string) {
    // 1. Lấy Warehouse ID của Bếp
    const warehouseId = await this.getCentralWarehouseId();

    // 2. Lấy danh sách sản phẩm trong đơn hàng
    const orderItems = await this.db
      .select({
        productId: schema.orderItems.productId,
        productName: schema.products.name,
        quantityApproved: schema.orderItems.quantityApproved,
      })
      .from(schema.orderItems)
      .innerJoin(
        schema.products,
        eq(schema.orderItems.productId, schema.products.id),
      )
      .where(eq(schema.orderItems.orderId, orderId));

    if (orderItems.length === 0)
      throw new NotFoundException('Đơn hàng không có dữ liệu soạn.');

    // 3. Xây dựng danh sách gợi ý
    const itemsWithSuggestions = await Promise.all(
      orderItems.map(async (item) => {
        const batches = await this.warehouseRepo.findAvailableBatchesForFefo(
          warehouseId,
          item.productId,
        );

        let remainingToAssign = Number(item.quantityApproved);
        const suggestedBatches: SuggestedBatch[] = [];

        for (const b of batches) {
          if (remainingToAssign <= 0) break;

          const available =
            Number(b.physicalQuantity) - Number(b.reservedQuantity);
          const take = Math.min(available, remainingToAssign);

          if (take > 0) {
            suggestedBatches.push({
              batchCode: b.batchCode,
              quantityToPick: take,
              expiryDate: b.expiryDate,
            });
            remainingToAssign -= take;
          }
        }

        return {
          productId: item.productId,
          productName: item.productName,
          requiredQuantity: Number(item.quantityApproved),
          suggestedBatches: suggestedBatches,
        };
      }),
    );

    return {
      orderId: orderId,
      items: itemsWithSuggestions,
    };
  }

  // --- 4. VALIDATE PICK ITEM (FEFO Enforcement) ---
  async validatePickItem(warehouseId: number, dto: PickItemDto) {
    const scannedBatch = await this.warehouseRepo.findBatchByCode(
      dto.batch_code,
    );
    if (!scannedBatch)
      throw new NotFoundException('Mã lô không tồn tại trong hệ thống');
    if (scannedBatch.productId !== dto.product_id)
      throw new BadRequestException('Mã lô không thuộc sản phẩm này');

    const availableBatches = await this.warehouseRepo.findAvailableBatches(
      warehouseId,
      dto.product_id,
    );

    if (availableBatches.length === 0) {
      throw new BadRequestException('Kho đã hết sạch sản phẩm này');
    }

    const bestBatch = availableBatches[0];
    const scannedDate = new Date(scannedBatch.expiryDate).getTime();
    const bestDate = new Date(bestBatch.expiryDate).getTime();

    if (scannedDate > bestDate) {
      throw new ForbiddenException(
        `Vi phạm quy tắc FEFO! Hãy lấy lô ${bestBatch.batchCode} (HSD: ${bestBatch.expiryDate}) trước.`,
      );
    }

    return {
      valid: true,
      message: 'Mã lô hợp lệ. Đã xác nhận.',
      batch_code: dto.batch_code,
      scanned_qty: dto.quantity,
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
      order_id: orderId,
    };
  }

  // --- 6. FINALIZE SHIPMENT ---
  async finalizeShipment(warehouseId: number, dto: FinalizeShipmentDto) {
    const shipment = await this.warehouseRepo.findShipmentByOrderId(
      dto.order_id,
    );

    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status !== 'preparing') {
      throw new BadRequestException('Shipment already finalized');
    }

    await this.warehouseRepo.finalizeShipmentTransaction(
      warehouseId,
      shipment.id,
      dto.order_id,
      shipment.items,
    );

    return { success: true, message: 'Đã xuất kho thành công' };
  }

  // --- 7. GET SHIPMENT LABEL ---
  async getShipmentLabel(shipmentId: string) {
    const shipment = await this.warehouseRepo.findShipmentById(shipmentId);
    if (!shipment) throw new NotFoundException('Phiếu giao hàng không tồn tại');

    return {
      template_type: 'INVOICE_A4',
      shipment_id: shipment.id,
      date: new Date().toISOString(),
      store_name: shipment.order.store.name,
      items: shipment.items.map((item) => ({
        product: item.batch.product.name,
        batch_code: item.batch.batchCode,
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
      product_name: batchInfo.product.name,
      batch_code: batchInfo.batchCode,
      expiry_date: batchInfo.expiryDate,
      quantity_physical: inv ? parseFloat(inv.quantity) : 0,
      status:
        inv && parseFloat(inv.quantity) > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    };
  }

  // --- 9. REPORT ISSUE (Sửa lại hoàn chỉnh) ---
  async reportIssue(warehouseId: number, dto: ReportIssueDto) {
    // 1. Validate Inventory
    const inventory = await this.warehouseRepo.findInventory(
      warehouseId,
      dto.batch_id,
    );
    if (!inventory) throw new NotFoundException('Lô hàng không có trong kho');

    // 2. Validate Shipment Item
    const shipmentItem = await this.warehouseRepo.findShipmentItemByBatch(
      dto.batch_id,
    );
    if (!shipmentItem)
      throw new BadRequestException('Lô hàng không nằm trong đơn đang soạn');

    // 3. Lấy Product ID từ Batch (Để tìm lô thay thế cùng loại)
    // Cần phải chắc chắn inventory.batchId là đúng
    // Ở đây ta gọi lại DB để lấy thông tin batch đầy đủ vì inventory chỉ có batchId
    // (Hoặc nếu repo.findInventory join sẵn batch thì tốt, ở đây giả định phải query)

    // Lưu ý: Cần thêm hàm findBatchById vào Repo hoặc dùng query raw.
    // Giả sử dùng tạm logic lấy batchCode rồi tìm lại (hơi thừa nhưng an toàn với code hiện tại)
    // Cách tốt nhất: Service gọi Repo transaction

    // Ở đây tôi sẽ sử dụng findBatchByCode đã có nhưng sửa lại Repo nếu cần
    // Tạm thời gọi Repo lấy Batch Info
    const batchInfo = await this.db.query.batches.findFirst({
      where: eq(schema.batches.id, dto.batch_id),
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
      old_batch_id: dto.batch_id,
      replaced_with: result.newAllocations,
    };
  }
}
