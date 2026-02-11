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
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly shipmentService: ShipmentService,
  ) {}

  async getCatalog(query: GetCatalogDto) {
    return this.orderRepository.getActiveProducts(query);
  }

  async findAll(query: GetOrdersDto) {
    return this.orderRepository.findAll(query);
  }

  async createOrder(user: IJwtPayload, dto: CreateOrderDto) {
    if (!user.storeId) {
      throw new BadRequestException(
        'Người dùng không thuộc về bất kỳ cửa hàng nào',
      );
    }

    const { deliveryDate, items } = dto;

    // Validate products
    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = [...new Set(productIds)];

    const activeProducts =
      await this.orderRepository.findActiveProductsByIds(uniqueProductIds);

    const validProductIds = new Set(activeProducts.map((p) => p.id));
    const invalidProductIds = uniqueProductIds.filter(
      (id) => !validProductIds.has(id),
    );

    if (invalidProductIds.length > 0) {
      throw new BadRequestException(
        `Danh sách sản phẩm không hợp lệ hoặc không hoạt động: ${invalidProductIds.join(', ')}`,
      );
    }

    try {
      const newOrder = await this.orderRepository.createOrderTransaction(
        user.storeId,
        deliveryDate,
        items,
      );

      return {
        id: newOrder.id,
        storeId: newOrder.storeId,
        status: newOrder.status,
        deliveryDate: newOrder.deliveryDate,
        createdAt: newOrder.createdAt,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Giao dịch thất bại: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`,
      );
    }
  }

  async getMyStoreOrders(user: IJwtPayload) {
    if (!user.storeId) {
      throw new BadRequestException(
        'Người dùng không thuộc về bất kỳ cửa hàng nào',
      );
    }

    return this.orderRepository.getOrdersByStore(user.storeId);
  }

  async getCoordinatorOrders(status?: OrderStatus) {
    return this.orderRepository.getOrdersForCoordinator(status);
  }

  async approveOrder(orderId: string, confirm?: boolean) {
    return this.orderRepository
      .runTransaction(async (tx) => {
        // 1. Fetch Order
        const order = await this.orderRepository.getOrderById(orderId, tx);
        if (!order) {
          throw new NotFoundException('Không tìm thấy đơn hàng');
        }

        if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
          throw new BadRequestException(
            'Đơn hàng không ở trạng thái chờ xử lý',
          );
        }

        // 2. Get Central Warehouse
        const centralWarehouseId =
          await this.orderRepository.getCentralWarehouseId(tx);
        if (!centralWarehouseId) {
          throw new InternalServerErrorException(
            'Không tìm thấy kho trung tâm',
          );
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

        // --- New Logic: Calculate Ideals ---
        const totalRequested = results.reduce(
          (sum, item) => sum + item.requested,
          0,
        );
        const totalApproved = results.reduce(
          (sum, item) => sum + item.approved,
          0,
        );

        // --- Business Rule: Zero-Fulfillment ---
        if (totalRequested > 0 && totalApproved === 0) {
          await this.orderRepository.updateStatusWithReason(
            order.id,
            OrderStatus.REJECTED,
            'Không thể duyệt đơn do tất cả mặt hàng đã hết tồn kho',
            tx,
          );
          return {
            success: false,
            message: 'Không thể duyệt đơn do tất cả mặt hàng đã hết tồn kho',
            orderId: order.id,
            status: OrderStatus.REJECTED,
            results,
          };
        }

        // --- Business Rule: Low Fill-rate ---
        const fillRate =
          totalRequested > 0 ? totalApproved / totalRequested : 0;
        if (fillRate < 0.2 && !confirm) {
          throw new BadRequestException({
            message:
              'Tỷ lệ đáp ứng quá thấp (dưới 20%), bạn có chắc chắn muốn giao đơn này không?',
            fiilRate: (fillRate * 100).toFixed(2) + '%',
            canForce: true,
          });
        }

        // 4. Update Order Status (Approved)
        await this.orderRepository.updateOrderApproved(order.id, tx);

        // 5. Create Shipment
        const storeWarehouseId = await this.orderRepository.getStoreWarehouseId(
          order.storeId,
          tx,
        );

        if (!storeWarehouseId) {
          throw new InternalServerErrorException(
            'Không tìm thấy kho cửa hàng để tạo vận chuyển',
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
          orderId: order.id,
          status: OrderStatus.APPROVED,
          results,
        };
      })
      .then((res) => {
        if (res.status === OrderStatus.REJECTED) {
          throw new BadRequestException(res.message);
        }
        return res;
      });
  }

  async rejectOrder(orderId: string, reason: string) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ có thể từ chối đơn hàng đang chờ xử lý',
      );
    }

    await this.orderRepository.updateStatusWithReason(
      orderId,
      OrderStatus.REJECTED,
      reason,
    );

    return {
      orderId,
      status: OrderStatus.REJECTED,
    };
  }

  async cancelOrder(orderId: string, user: IJwtPayload) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    // Data Isolation Check
    if (order.storeId !== user.storeId) {
      throw new ForbiddenException(
        'Bạn chỉ có thể hủy đơn hàng của cửa hàng mình',
      );
    }

    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn hàng đang chờ xử lý');
    }

    await this.orderRepository.updateStatusWithReason(
      orderId,
      OrderStatus.CANCELLED,
      'Hủy bởi nhân viên cửa hàng',
    );

    return {
      orderId,
      status: OrderStatus.CANCELLED,
    };
  }

  async getOrderDetails(orderId: string, user: IJwtPayload) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    const isCoordinator =
      (user.role as UserRole) === UserRole.SUPPLY_COORDINATOR;

    // Data Isolation for Store Staff: strictly no access to other store's orders
    if (!isCoordinator && order.storeId !== user.storeId) {
      throw new ForbiddenException('Từ chối truy cập');
    }
    return order;
  }

  async reviewOrder(orderId: string) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

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
