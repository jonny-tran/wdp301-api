import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  // InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm'; // Import eq
import * as schema from '../../database/schema';
import { DATABASE_CONNECTION } from '../../database/database.constants'; // Import DB Connection
import {
  FinalizeShipmentDto,
  PickItemDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { WarehouseRepository } from './warehouse.repository';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly warehouseRepo: WarehouseRepository,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>, // Inject DB để dùng cho getCentralWarehouseId
  ) {}

  //Helper: Lấy ID kho trung tâm (Thêm lại hàm này)
  async getCentralWarehouseId(): Promise<number> {
    const warehouse = await this.db.query.warehouses.findFirst({
      where: eq(schema.warehouses.type, 'central'),
    });

    if (!warehouse) {
      throw new NotFoundException(
        'Không tìm thấy Kho Trung Tâm (Central Warehouse) trong hệ thống.',
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
    const shipment = await this.warehouseRepo.findShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found');

    // Logic Grouping dữ liệu để trả về FE
    const groupedItems = new Map<
      number,
      {
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
          productName: item.batch.product.name,
          requiredQty: 0,
          suggestedBatches: [],
        });
      }
      const entry = groupedItems.get(productId);
      if (!entry) continue; // Check an toàn

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

  // --- 4. VALIDATE PICK ITEM (FEFO Enforcement) ---
  async validatePickItem(warehouseId: number, dto: PickItemDto) {
    const scannedBatch = await this.warehouseRepo.findBatchByCode(
      dto.batchCode,
    );
    if (!scannedBatch)
      throw new NotFoundException('Mã lô không tồn tại trong hệ thống');
    if (scannedBatch.productId !== dto.productId)
      throw new BadRequestException('Mã lô không thuộc sản phẩm này');

    const availableBatches = await this.warehouseRepo.findAvailableBatches(
      warehouseId,
      dto.productId,
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
      batchCode: dto.batchCode,
      scannedQty: dto.quantity,
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
  async finalizeShipment(warehouseId: number, dto: FinalizeShipmentDto) {
    const shipment = await this.warehouseRepo.findShipmentByOrderId(
      dto.orderId,
    );

    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status !== 'preparing') {
      throw new BadRequestException('Shipment already finalized');
    }

    await this.warehouseRepo.finalizeShipmentTransaction(
      warehouseId,
      shipment.id,
      dto.orderId,
      shipment.items,
    );

    return { success: true, message: 'Đã xuất kho thành công' };
  }

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
}
