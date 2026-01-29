import { Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { ShipmentRepository } from './shipment.repository';

@Injectable()
export class ShipmentService {
  constructor(private readonly shipmentRepository: ShipmentRepository) {}

  async createShipmentForOrder(
    orderId: string,
    fromWarehouseId: number,
    toWarehouseId: number, // In this case, it might be the store's internal warehouse if it exists, or just a placeholder
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
      throw new NotFoundException('Shipment not found');
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
        // Location would be here if we had a location field in batch/inventory
      })),
    };
  }
}
