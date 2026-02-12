import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { ClaimService } from '../claim/claim.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from './constants/shipment-status.enum';
import { GetShipmentsDto } from './dto/get-shipments.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ShipmentRepository } from './shipment.repository';

@Injectable()
export class ShipmentService {
  private readonly shipmentStatusEnum = ShipmentStatus;
  private readonly orderStatusEnum = OrderStatus;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly shipmentRepository: ShipmentRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly inventoryService: InventoryService,
    @Inject(forwardRef(() => ClaimService))
    private readonly claimService: ClaimService,
  ) {}

  async findAll(query: GetShipmentsDto) {
    return this.shipmentRepository.findAll(query);
  }

  async createShipmentForOrder(
    orderId: string,
    fromWarehouseId: number,
    toWarehouseId: number,
    items: { batchId: number; quantity: number }[],
    tx: NodePgDatabase<typeof schema>,
  ) {
    // 1. Create Shipment Record
    const shipment = await this.shipmentRepository.createShipment(
      orderId,
      fromWarehouseId,
      toWarehouseId,
      tx,
    );

    // 2. Create Shipment Items
    const shipmentItems = items.map((item) => ({
      shipmentId: shipment.id,
      batchId: item.batchId,
      quantity: item.quantity.toString(),
    }));

    await this.shipmentRepository.createShipmentItems(shipmentItems, tx);

    return shipment;
  }

  async getPickingList(shipmentId: string) {
    const shipment =
      await this.shipmentRepository.getShipmentWithItems(shipmentId);

    if (!shipment) {
      throw new NotFoundException('Chuyến hàng không tồn tại');
    }

    // Format the response for the warehouse staff
    return {
      shipment_id: shipment.id,
      order_id: shipment.orderId,
      store_name: shipment.order.store.name,
      status: shipment.status,
      items: shipment.items.map((item) => ({
        product_name: item.batch.product.name,
        sku: item.batch.product.sku,
        batch_code: item.batch.batchCode,
        quantity: item.quantity,
        expiry_date: item.batch.expiryDate,
        image_url: item.batch.product.imageUrl,
      })),
    };
  }

  async getIncomingShipments(storeId: string) {
    const warehouse =
      await this.inventoryRepository.findWarehouseByStoreId(storeId);
    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho cho cửa hàng này');
    }

    const shipments = await this.shipmentRepository.findIncomingShipments(
      warehouse.id,
    );

    return shipments.map((shipment) => ({
      id: shipment.id,
      orderId: shipment.orderId,
      status: shipment.status,
      createdAt: shipment.createdAt,
      fromWarehouse: {
        id: shipment.fromWarehouseId,
      },
    }));
  }

  async getShipmentDetail(shipmentId: string, storeId: string) {
    const shipment = await this.shipmentRepository.getShipmentById(shipmentId);

    if (!shipment) {
      throw new NotFoundException('Không tìm thấy chuyến hàng này');
    }

    // Verify ownership: shipment must be going to this store's warehouse
    const warehouse = await this.shipmentRepository.findWarehouseById(
      shipment.toWarehouseId,
    );

    if (!warehouse || warehouse.storeId !== storeId) {
      throw new ForbiddenException('Bạn không có quyền xem chuyến hàng này');
    }

    return {
      id: shipment.id,
      orderId: shipment.orderId,
      status: shipment.status,
      createdAt: shipment.createdAt,
      items: shipment.items.map((item) => ({
        batchId: item.batchId,
        batchCode: item.batch.batchCode,
        productName: item.batch.product.name,
        sku: item.batch.product.sku,
        quantity: parseFloat(item.quantity),
        expiryDate: item.batch.expiryDate,
        imageUrl: item.batch.product.imageUrl,
      })),
    };
  }

  async receiveShipment(
    shipmentId: string,
    dto: ReceiveShipmentDto,
    userId: string,
    storeId: string,
  ) {
    return this.uow.runInTransaction(async (tx) => {
      // 1. Get Shipment
      const shipment =
        await this.shipmentRepository.getShipmentWithItems(shipmentId);

      if (!shipment) {
        throw new NotFoundException('Không tìm thấy chuyến hàng');
      }

      // 2. Validate Ownership & Status
      // If storeId is provided, enforce it
      if (shipment.order.storeId !== storeId) {
        throw new ForbiddenException(
          'Chuyến hàng không thuộc về cửa hàng của bạn',
        );
      }

      if (shipment.status !== (this.shipmentStatusEnum.IN_TRANSIT as any)) {
        throw new BadRequestException(
          `Chuyến hàng đang ở trạng thái "${shipment.status}", chỉ có thể nhận hàng khi hàng đang trên đường.`,
        );
      }

      // 3. Process Items
      const claimItems: {
        productId: number;
        quantityMissing: number;
        quantityDamaged: number;
        reason: string;
        imageUrl?: string;
      }[] = [];

      // Map DTO items for fast lookup
      const receivedMap = new Map<
        number,
        { actual: number; damaged: number; evidence: string[] }
      >();
      if (dto.items && dto.items.length > 0) {
        dto.items.forEach((item) => {
          receivedMap.set(item.batchId, {
            actual: item.actualQty,
            damaged: item.damagedQty,
            evidence: item.evidenceUrls || [], // Optional
          });
        });
      }

      // Loop through ALL Shipped Items from DB
      for (const shippedItem of shipment.items) {
        const shippedQty = parseFloat(shippedItem.quantity);
        let actualQty = shippedQty;
        let damagedQty = 0;
        let evidence: string[] = [];

        // If exists in DTO, use strict reported values
        if (receivedMap.has(shippedItem.batchId)) {
          const report = receivedMap.get(shippedItem.batchId)!;
          actualQty = report.actual;
          damagedQty = report.damaged;
          evidence = report.evidence;
        }
        // Else: Assume Receive Full (Default)

        // Calculate Discrepancy
        const missingQty = shippedQty - actualQty;
        const goodQty = actualQty - damagedQty;

        // Validation
        if (goodQty < 0) {
          throw new BadRequestException(
            `Lỗi dữ liệu lô ${shippedItem.batch.batchCode}: Số lượng hỏng (${damagedQty}) lớn hơn số lượng thực nhận (${actualQty}).`,
          );
        }

        // 4. Update Inventory (Good Stocks)
        if (goodQty > 0) {
          await this.inventoryService.updateInventory(
            shipment.toWarehouseId,
            shippedItem.batchId,
            goodQty,
            tx,
          );

          await this.inventoryService.logInventoryTransaction(
            shipment.toWarehouseId,
            shippedItem.batchId,
            'import',
            goodQty,
            shipmentId,
            'Shipment Receipt',
            tx,
          );
        }

        // 5. Prepare Claim if needed
        if (missingQty > 0 || damagedQty > 0) {
          // Basic reason construction
          const reasons: string[] = [];
          if (missingQty > 0) reasons.push(`Thiếu: ${missingQty}`);
          if (damagedQty > 0) reasons.push(`Hỏng: ${damagedQty}`);

          claimItems.push({
            productId: shippedItem.batch.productId,
            quantityMissing: Math.max(0, missingQty),
            quantityDamaged: Math.max(0, damagedQty),
            reason: reasons.join(', '),
            imageUrl: evidence.length > 0 ? evidence.join(',') : undefined,
          });
        }
      }

      // 6. Update Shipment Status
      await this.shipmentRepository.updateShipmentStatus(
        shipmentId,
        this.shipmentStatusEnum.COMPLETED,
        tx,
      );

      // 7. Create Claim if Discrepancies exist
      let claimId: string | null = null;
      if (claimItems.length > 0) {
        const claim = await this.claimService.createClaim(
          shipmentId,
          userId,
          claimItems,
          tx,
        );
        claimId = claim.id;
      }

      // 8. Update Order Status
      // If Claim created -> CLAIMED, else COMPLETED
      const newOrderStatus = claimId
        ? this.orderStatusEnum.CLAIMED
        : this.orderStatusEnum.COMPLETED;

      await this.shipmentRepository.updateOrderStatus(
        shipment.orderId,
        newOrderStatus,
        tx,
      );

      return {
        message: 'Xác nhận nhận hàng thành công.',
        shipmentId: shipment.id,
        status: 'completed',
        hasDiscrepancy: claimId !== null,
        claimId: claimId,
      };
    });
  }
}
