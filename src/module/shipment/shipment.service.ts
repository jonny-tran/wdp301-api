import {
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
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ShipmentHelper } from './helper/shipment.helper';
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
    // Get warehouse ID for this store
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
      // 1. Get shipment & warehouse
      const shipment =
        await this.shipmentRepository.getShipmentById(shipmentId);

      const warehouse = shipment
        ? await this.shipmentRepository.findWarehouseById(
            shipment.toWarehouseId,
            tx,
          )
        : null;

      // 2. Validate Access & Status
      ShipmentHelper.validateShipmentAccess(shipment, warehouse, storeId);

      // After validation, safely assert existence
      const validShipment = shipment!;
      const validWarehouse = warehouse!;

      // 3. Validate Batch Consistency
      ShipmentHelper.validateBatchConsistency(validShipment, dto);

      // 4. Process Items
      const { inventoryUpdates, discrepancies } =
        ShipmentHelper.processReceivedItems(validShipment, dto);

      // 5. Update Inventory
      for (const update of inventoryUpdates) {
        await this.inventoryService.updateInventory(
          validWarehouse.id,
          update.batchId,
          update.goodQty,
          tx,
        );

        await this.inventoryService.logInventoryTransaction(
          validWarehouse.id,
          update.batchId,
          'import',
          update.goodQty,
          shipmentId,
          update.reason,
          tx,
        );
      }

      // 6. Update shipment status
      await this.shipmentRepository.updateShipmentStatus(
        shipmentId,
        this.shipmentStatusEnum.COMPLETED,
        tx,
      );

      // 7. Create claim if there are discrepancies
      let claimId: string | null = null;
      if (discrepancies.length > 0) {
        const claim = await this.claimService.createClaim(
          shipmentId,
          userId,
          discrepancies,
          tx,
        );
        claimId = claim.id;
      }

      // 8. Update order status
      const newOrderStatus = claimId
        ? this.orderStatusEnum.CLAIMED
        : this.orderStatusEnum.COMPLETED;
      await this.shipmentRepository.updateOrderStatus(
        validShipment.orderId,
        newOrderStatus,
        tx,
      );

      return {
        shipmentId: validShipment.id,
        status: 'completed',
        claimCreated: claimId !== null,
        claimId,
      };
    });
  }
}
