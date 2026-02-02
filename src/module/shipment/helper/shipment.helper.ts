import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ReceiveShipmentDto } from '../dto/receive-shipment.dto';

interface ShipmentWithItems {
  id: string;
  toWarehouseId: number;
  orderId: string;
  status: string;
  items: {
    batchId: number;
    quantity: string;
    batch: {
      productId: number;
    };
  }[];
}

interface Warehouse {
  id: number;
  storeId: string | null;
}

export class ShipmentHelper {
  static validateShipmentAccess(
    shipment: ShipmentWithItems | undefined | null,
    warehouse: Warehouse | undefined | null,
    storeId: string,
  ) {
    if (!shipment) {
      throw new NotFoundException('Không tìm thấy chuyến hàng này');
    }

    if (!warehouse || warehouse.storeId !== storeId) {
      throw new ForbiddenException('Bạn không có quyền nhận chuyến hàng này');
    }

    if (shipment.status !== 'in_transit') {
      throw new HttpException(
        'Chuyến hàng không ở trạng thái có thể nhận',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  static validateBatchConsistency(
    shipment: ShipmentWithItems,
    dto: ReceiveShipmentDto,
  ) {
    const shipmentBatchIds = shipment.items.map((item) => item.batchId);
    const dtoBatchIds = dto.items.map((item) => item.batchId);

    for (const batchId of dtoBatchIds) {
      if (!shipmentBatchIds.includes(batchId)) {
        throw new HttpException(
          `Batch ID ${batchId} không thuộc chuyến hàng này`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  static processReceivedItems(
    shipment: ShipmentWithItems,
    dto: ReceiveShipmentDto,
  ) {
    const inventoryUpdates: {
      batchId: number;
      goodQty: number;
      reason?: string;
    }[] = [];

    const discrepancies: {
      productId: number;
      quantityMissing: number;
      quantityDamaged: number;
      reason?: string;
      imageUrl?: string;
    }[] = [];

    for (const receivedItem of dto.items) {
      const shipmentItem = shipment.items.find(
        (item) => item.batchId === receivedItem.batchId,
      );

      if (!shipmentItem) continue;

      const expectedQty = parseFloat(shipmentItem.quantity);
      const { actualQty, damagedQty } = receivedItem;

      // Validate quantities
      if (actualQty < 0 || damagedQty < 0) {
        throw new HttpException(
          'Số lượng thực nhận và số lượng hàng hỏng không được âm',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (damagedQty > actualQty) {
        throw new HttpException(
          'Số lượng hàng hỏng không được lớn hơn số lượng thực nhận',
          HttpStatus.BAD_REQUEST,
        );
      }

      const goodQty = actualQty - damagedQty;

      inventoryUpdates.push({
        batchId: receivedItem.batchId,
        goodQty,
        reason: dto.notes,
      });

      const quantityMissing = Math.max(0, expectedQty - actualQty);
      const hasDiscrepancy = quantityMissing > 0 || damagedQty > 0;

      if (hasDiscrepancy) {
        discrepancies.push({
          productId: shipmentItem.batch.productId,
          quantityMissing,
          quantityDamaged: damagedQty,
          reason: dto.notes,
          imageUrl: dto.evidenceUrls?.[0],
        });
      }
    }

    return { inventoryUpdates, discrepancies };
  }
}
