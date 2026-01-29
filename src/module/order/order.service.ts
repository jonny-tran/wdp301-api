import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../auth/dto/create-user.dto';
import { IJwtPayload } from '../auth/types/auth.types';
import { ShipmentService } from '../shipment/shipment.service';
import { OrderStatus } from './constants/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly shipmentService: ShipmentService,
  ) {}

  async getCatalog() {
    return this.orderRepository.getActiveProducts();
  }

  async createOrder(user: IJwtPayload, dto: CreateOrderDto) {
    if (!user.storeId) {
      throw new BadRequestException('User does not belong to a store');
    }

    const { delivery_date, items } = dto;

    // Validate products
    const productIds = items.map((item) => item.product_id);
    const uniqueProductIds = [...new Set(productIds)];

    const activeProducts =
      await this.orderRepository.findActiveProductsByIds(uniqueProductIds);

    const validProductIds = new Set(activeProducts.map((p) => p.id));
    const invalidProductIds = uniqueProductIds.filter(
      (id) => !validProductIds.has(id),
    );

    if (invalidProductIds.length > 0) {
      throw new BadRequestException(
        `Invalid or inactive product IDs: ${invalidProductIds.join(', ')}`,
      );
    }

    try {
      const newOrder = await this.orderRepository.createOrderTransaction(
        user.storeId,
        delivery_date,
        items,
      );

      return {
        id: newOrder.id,
        store_id: newOrder.storeId,
        status: newOrder.status,
        delivery_date: newOrder.deliveryDate,
        created_at: newOrder.createdAt,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getMyStoreOrders(user: IJwtPayload) {
    if (!user.storeId) {
      throw new BadRequestException('User does not belong to a store');
    }

    return this.orderRepository.getOrdersByStore(user.storeId);
  }

  async getCoordinatorOrders(status?: OrderStatus) {
    return this.orderRepository.getOrdersForCoordinator(status);
  }

  async approveOrder(orderId: string) {
    return this.orderRepository.runTransaction(async (tx) => {
      // 1. Fetch Order
      const order = await this.orderRepository.getOrderById(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
        throw new BadRequestException('Order is not pending');
      }

      // 2. Get Central Warehouse
      const centralWarehouseId =
        await this.orderRepository.getCentralWarehouseId(tx);
      if (!centralWarehouseId) {
        throw new InternalServerErrorException('Central warehouse not found');
      }

      // 3. Process Items
      const shipmentItems: { batchId: number; quantity: number }[] = [];
      const results: {
        productId: number;
        requested: number;
        approved: number;
        missing: number;
      }[] = [];

      for (const item of order.items) {
        const requestedQty = parseFloat(item.quantityRequested);
        let remainingNeeded = requestedQty;
        let approvedQty = 0;

        const batches = await this.orderRepository.getBatchesForFEFO(
          item.productId,
          centralWarehouseId,
          tx,
        );

        for (const batch of batches) {
          if (remainingNeeded <= 0) break;

          const availableQty =
            parseFloat(batch.quantity) - parseFloat(batch.reservedQuantity);

          if (availableQty <= 0) continue;

          const takeQty = Math.min(remainingNeeded, availableQty);

          await this.orderRepository.reserveInventory(
            batch.inventoryId,
            takeQty,
            tx,
          );

          shipmentItems.push({
            batchId: batch.batchId,
            quantity: takeQty,
          });

          approvedQty += takeQty;
          remainingNeeded -= takeQty;
        }

        await this.orderRepository.updateOrderItemApprovedQuantity(
          item.id,
          approvedQty.toString(),
          tx,
        );

        results.push({
          productId: item.productId,
          requested: requestedQty,
          approved: approvedQty,
          missing: requestedQty - approvedQty,
        });
      }

      // 4. Update Order Status
      await this.orderRepository.updateOrderApproved(order.id, tx);

      // 5. Create Shipment
      const storeWarehouseId = await this.orderRepository.getStoreWarehouseId(
        order.storeId,
        tx,
      );

      if (!storeWarehouseId) {
        throw new InternalServerErrorException(
          'Store warehouse not found for shipment',
        );
      }

      await this.shipmentService.createShipmentForOrder(
        order.id,
        centralWarehouseId,
        storeWarehouseId,
        shipmentItems,
        tx,
      );

      return {
        success: true,
        message: 'Order approved and shipment created',
        orderId: order.id,
        status: OrderStatus.APPROVED,
        results,
      };
    });
  }

  async rejectOrder(orderId: string, reason: string) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be rejected');
    }

    await this.orderRepository.updateStatusWithReason(
      orderId,
      OrderStatus.REJECTED,
      reason,
    );

    return {
      message: 'Order rejected successfully',
      orderId,
      status: OrderStatus.REJECTED,
    };
  }

  async cancelOrder(orderId: string, user: IJwtPayload) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Data Isolation Check
    if (order.storeId !== user.storeId) {
      throw new ForbiddenException('You can only cancel your own store orders');
    }

    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    await this.orderRepository.updateStatusWithReason(
      orderId,
      OrderStatus.CANCELLED,
      'Cancelled by Store Staff',
    );

    return {
      message: 'Order cancelled successfully',
      orderId,
      status: OrderStatus.CANCELLED,
    };
  }

  async getOrderDetails(orderId: string, user: IJwtPayload) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isCoordinator =
      (user.role as UserRole) === UserRole.SUPPLY_COORDINATOR;

    // Data Isolation for Store Staff: strictly no access to other store's orders
    if (!isCoordinator && order.storeId !== user.storeId) {
      throw new ForbiddenException('Access denied');
    }

    // For both Store and Coordinator, return standard details here.
    // Stock info is strictly for the Review endpoint.
    return order;
  }

  async reviewOrder(orderId: string) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Ensure it is pending before review, or allow reviewing any order?
    // Context implies review for approval.

    const centralWarehouseId =
      await this.orderRepository.getCentralWarehouseId();

    const itemsWithReviewData = await Promise.all(
      order.items.map(async (item) => {
        // Calculate Total Available Stock (Physical - Reserved)
        // We use getBatchesForFEFO which returns batches where qty > reserved.
        const batches = centralWarehouseId
          ? await this.orderRepository.getBatchesForFEFO(
              item.productId,
              centralWarehouseId,
            )
          : [];

        // Sum up available quantities
        const currentStock = batches.reduce((sum, batch) => {
          const available =
            parseFloat(batch.quantity) - parseFloat(batch.reservedQuantity);
          return sum + (available > 0 ? available : 0);
        }, 0);

        return {
          productId: item.productId,
          productName: item.product.name,
          requestedQty: parseFloat(item.quantityRequested),
          currentStock: currentStock,
          canFulfill: currentStock >= parseFloat(item.quantityRequested),
        };
      }),
    );

    return {
      orderId: order.id,
      storeName: order.store.name,
      status: order.status,
      items: itemsWithReviewData,
    };
  }
}
