import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  isPastClosingTime,
  nextTruckDeparture,
  nowVn,
  parseToStartOfDayVn,
  VN_TZ,
} from '../../common/time/vn-time';
import * as schema from '../../database/schema';
import { UserRole } from '../auth/dto/create-user.dto';
import { IJwtPayload } from '../auth/types/auth.types';
import { ShipmentService } from '../shipment/shipment.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  HIGH_VALUE_INVENTORY_CHECK_MAX_AGE_MS,
  PRICE_JUMP_THRESHOLD,
} from './constants/ord-optimize.constants';
import { OrderStatus } from './constants/order-status.enum';
import { PriceConfirmNeededError } from './errors/price-confirm-needed.error';
import { ProductionConfirmNeededError } from './errors/production-confirm-needed.error';
import {
  FulfillmentRateQueryDto,
  SlaQueryDto,
} from './dto/analytics-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { OrderRepository } from './order.repository';

//interface
export interface ShortfallReason {
  reason: string;
  shortfallQuantity: number;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly shipmentService: ShipmentService,
    private readonly systemConfigService: SystemConfigService,
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

    const storeId = user.storeId;

    const { deliveryDate, items, lastInventoryCheckTimestamp } = dto;

    if (!items || items.length === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất một sản phẩm');
    }

    const requestedStart = parseToStartOfDayVn(deliveryDate);
    const todayStartCheck = nowVn().startOf('day');
    if (!requestedStart.isAfter(todayStartCheck)) {
      throw new BadRequestException('Ngày giao hàng không hợp lệ');
    }

    const hasDebt =
      await this.orderRepository.hasStaleUnconfirmedShipment(storeId);
    if (hasDebt) {
      throw new BadRequestException(
        'Cửa hàng có chuyến hàng (in_transit) quá 48 giờ chưa xác nhận nhận hàng. Vui lòng xử lý trước khi đặt đơn mới.',
      );
    }

    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = [...new Set(productIds)];

    const activeProducts =
      await this.orderRepository.findActiveProductsByIds(uniqueProductIds);
    const snapshots =
      await this.orderRepository.findProductsWithSnapshotByIds(uniqueProductIds);

    const validProductIds = new Set(activeProducts.map((p) => p.id));
    const invalidProductIds = uniqueProductIds.filter(
      (id) => !validProductIds.has(id),
    );

    if (invalidProductIds.length > 0) {
      throw new BadRequestException(
        `Danh sách sản phẩm không hợp lệ hoặc không hoạt động: ${invalidProductIds.join(', ')}`,
      );
    }

    const snapById = new Map(snapshots.map((p) => [p.id, p]));

    const highValueNeedsCheck = snapshots.some((p) => p.isHighValue);
    if (highValueNeedsCheck) {
      if (!lastInventoryCheckTimestamp) {
        throw new BadRequestException(
          'Mặt hàng giá trị cao yêu cầu lastInventoryCheckTimestamp (đã kiểm kê gần đây).',
        );
      }
      const checkTs = new Date(lastInventoryCheckTimestamp).getTime();
      if (
        Number.isNaN(checkTs) ||
        Date.now() - checkTs > HIGH_VALUE_INVENTORY_CHECK_MAX_AGE_MS
      ) {
        throw new BadRequestException(
          'Thời điểm kiểm kê quá cũ (quá 24 giờ). Vui lòng kiểm kê lại trước khi đặt hàng.',
        );
      }
    }

    const store = await this.orderRepository.getStoreById(storeId);
    if (!store) {
      throw new BadRequestException('Không tìm thấy cửa hàng');
    }

    const vnNow = nowVn();
    const closingStr =
      await this.systemConfigService.getConfigValue('ORDER_CLOSING_TIME');
    const pastClosing = isPastClosingTime(vnNow, closingStr);

    let effectiveDeliveryVn = parseToStartOfDayVn(deliveryDate);
    if (pastClosing) {
      const minDelivery = vnNow.add(1, 'day').startOf('day');
      if (effectiveDeliveryVn.isBefore(minDelivery)) {
        effectiveDeliveryVn = minDelivery;
      }
    }

    const maxPrep = Math.max(
      ...snapshots.map((p) => p.prepTimeHours ?? 24),
      0,
    );
    const transit = store.transitTimeHours ?? 24;
    const earliestInstant = vnNow.add(maxPrep + transit, 'hour');
    const earliestDay = earliestInstant.startOf('day');
    if (effectiveDeliveryVn.startOf('day').isBefore(earliestDay)) {
      throw new BadRequestException(
        `Ngày giao hàng sớm nhất theo hàng sơ chế và vận chuyển là ${earliestDay.tz(VN_TZ).format('YYYY-MM-DD')}.`,
      );
    }

    const linePayload = items.map((item) => {
      const s = snapById.get(item.productId)!;
      const price = parseFloat(String(s.unitPrice ?? '0'));
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitSnapshot: s.unitName,
        priceSnapshot: price.toFixed(2),
        packagingInfoSnapshot: s.packagingInfo ?? null,
      };
    });

    const totalAmount = linePayload
      .reduce(
        (sum, l) => sum + parseFloat(l.priceSnapshot) * l.quantity,
        0,
      )
      .toFixed(2);

    const deliveryDateForDb = effectiveDeliveryVn.startOf('day').toDate();

    try {
      return await this.orderRepository.runTransaction(async (tx) => {
        await this.orderRepository.acquireStoreOrderingLock(storeId, tx);

        const storeWarehouseId = await this.orderRepository.getStoreWarehouseId(
          storeId,
          tx,
        );
        if (!storeWarehouseId) {
          throw new BadRequestException('Không tìm thấy kho cửa hàng');
        }

        await this.orderRepository.lockStoreInventoryRowsForProducts(
          storeWarehouseId,
          uniqueProductIds,
          tx,
        );

        const inventoryByProduct =
          await this.orderRepository.sumStoreInventoryByProduct(
            storeWarehouseId,
            tx,
          );

        const maxCap =
          store.maxStorageCapacity != null
            ? parseFloat(String(store.maxStorageCapacity))
            : null;

        if (maxCap != null && !Number.isNaN(maxCap)) {
          for (const line of items) {
            const stock = inventoryByProduct.get(line.productId) ?? 0;
            const orderQty = line.quantity;
            if (stock + orderQty > maxCap) {
              throw new BadRequestException(
                `Vượt sức chứa tối đa cho kho: sản phẩm #${line.productId} (tồn ${stock} + đặt ${orderQty} > ${maxCap}).`,
              );
            }
          }
        }

        let consolidationGroupId: string;
        if (pastClosing) {
          consolidationGroupId = randomUUID();
        } else {
          consolidationGroupId =
            (await this.orderRepository.findExistingConsolidationGroupId(
              storeId,
              deliveryDateForDb,
              tx,
            )) ?? randomUUID();
        }

        const newOrder = await this.orderRepository.insertOrderWithItems(tx, {
          storeId,
          deliveryDate: deliveryDateForDb,
          items: linePayload,
          consolidationGroupId,
          totalAmount,
        });

        return {
          id: newOrder.id,
          storeId: newOrder.storeId,
          status: newOrder.status,
          deliveryDate: newOrder.deliveryDate,
          createdAt: newOrder.createdAt,
          consolidationGroupId,
          totalAmount,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
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

  async approveOrder(
    orderId: string,
    confirm?: boolean,
    opts?: {
      price_acknowledged?: boolean;
      production_confirm?: boolean;
    },
  ) {
    try {
      return await this.orderRepository
        .runTransaction(async (tx) => {
          const order = await this.orderRepository.getOrderById(orderId, tx);
          if (!order) {
            throw new NotFoundException('Không tìm thấy đơn hàng');
          }

          if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
            throw new BadRequestException(
              'Đơn hàng không ở trạng thái chờ xử lý',
            );
          }

          const centralWarehouseId =
            await this.orderRepository.getCentralWarehouseId(tx);
          if (!centralWarehouseId) {
            throw new InternalServerErrorException(
              'Không tìm thấy kho trung tâm',
            );
          }

          const productIds = order.items.map((i) => i.productId);
          const catalogRows =
            await this.orderRepository.findProductsWithSnapshotByIds(productIds);
          const priceById = new Map(
            catalogRows.map((r) => [r.id, parseFloat(String(r.unitPrice ?? '0'))]),
          );

          for (const line of order.items) {
            if (line.priceSnapshot == null) continue;
            const snap = parseFloat(String(line.priceSnapshot));
            const cur = priceById.get(line.productId) ?? 0;
            if (
              snap > 0 &&
              Math.abs(cur - snap) / snap > PRICE_JUMP_THRESHOLD &&
              !opts?.price_acknowledged
            ) {
              throw new PriceConfirmNeededError();
            }
          }

          const shipmentItems: { batchId: number; quantity: number }[] = [];
          const results: {
            productId: number;
            requested: number;
            approved: number;
            missing: number;
          }[] = [];

          for (const item of order.items) {
            const requestedQty = parseFloat(String(item.quantityRequested));
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
                parseFloat(batch.quantity) -
                parseFloat(batch.reservedQuantity);

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

          const totalRequested = results.reduce(
            (sum, item) => sum + item.requested,
            0,
          );
          const totalApproved = results.reduce(
            (sum, item) => sum + item.approved,
            0,
          );

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

          const hasShortage = results.some((r) => r.missing > 0);
          if (
            hasShortage &&
            totalApproved > 0 &&
            !opts?.production_confirm
          ) {
            const shortageResults = results.filter((r) => r.missing > 0);
            const prepMissing = Math.max(
              ...shortageResults.map((r) => {
                const row = catalogRows.find((c) => c.id === r.productId);
                return row?.prepTimeHours ?? 24;
              }),
              0,
            );
            const transitHours = order.store?.transitTimeHours ?? 24;
            const truckStr =
              (await this.systemConfigService.getConfigValue(
                'TRUCK_DEPARTURE_TIME',
              )) ??
              (await this.systemConfigService.getConfigValue(
                'ORDER_CLOSING_TIME',
              )) ??
              '06:00';

            const clockVn = nowVn();
            const truckAt = nextTruckDeparture(clockVn, truckStr);
            const eta = clockVn
              .add(prepMissing, 'hour')
              .add(transitHours, 'hour');

            if (!eta.isAfter(truckAt)) {
              throw new ProductionConfirmNeededError();
            }
          }

          await this.orderRepository.setOrderProductionFlag(
            order.id,
            false,
            tx,
          );

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

          await this.orderRepository.updateOrderApproved(order.id, tx);

          const storeWarehouseId =
            await this.orderRepository.getStoreWarehouseId(order.storeId, tx);

          if (!storeWarehouseId) {
            throw new InternalServerErrorException(
              'Không tìm thấy kho cửa hàng để tạo vận chuyển',
            );
          }

          const maxWStr =
            await this.systemConfigService.getConfigValue(
              'VEHICLE_MAX_WEIGHT_KG',
            );
          const maxVehicleWeightKg = maxWStr
            ? parseFloat(maxWStr)
            : null;

          await this.shipmentService.createShipmentForOrder(
            order.id,
            centralWarehouseId,
            storeWarehouseId,
            shipmentItems,
            tx,
            {
              consolidationGroupId: order.consolidationGroupId ?? null,
              maxVehicleWeightKg:
                maxVehicleWeightKg != null && !Number.isNaN(maxVehicleWeightKg)
                  ? maxVehicleWeightKg
                  : null,
            },
          );

          await this.orderRepository.setOrderPendingPriceConfirm(
            order.id,
            false,
            tx,
          );

          return {
            orderId: order.id,
            status: OrderStatus.APPROVED,
            results,
            requiresProductionConfirm: false,
          };
        })
        .then((res) => {
          if (res.status === OrderStatus.REJECTED) {
            throw new BadRequestException(res.message);
          }
          return res;
        });
    } catch (e) {
      if (e instanceof ProductionConfirmNeededError) {
        await this.orderRepository.setOrderProductionFlag(orderId, true);
        throw new BadRequestException({
          code: 'PRODUCTION_CONFIRMATION_REQUIRED',
          message:
            'Đơn thiếu hàng một phần. Cần xác nhận phối hợp với bếp (production_confirm) hoặc gọi lại để duyệt.',
        });
      }
      if (e instanceof PriceConfirmNeededError) {
        await this.orderRepository.setOrderPendingPriceConfirm(orderId, true);
        throw new BadRequestException({
          code: 'PRICE_CONFIRMATION_REQUIRED',
          message:
            'Giá catalog lệch hơn 20% so với snapshot trên đơn. Cần xác nhận (price_acknowledged) hoặc cửa hàng xác nhận giá.',
        });
      }
      throw e;
    }
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
      throw new BadRequestException(
        'Chỉ có thể hủy đơn ở trạng thái chờ duyệt (pending). Đơn đã duyệt cần điều phối xử lý hủy bắt buộc.',
      );
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

  async confirmStorePriceAcknowledgment(orderId: string, user: IJwtPayload) {
    if (!user.storeId) {
      throw new BadRequestException(
        'Người dùng không thuộc về bất kỳ cửa hàng nào',
      );
    }
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (order.storeId !== user.storeId) {
      throw new ForbiddenException('Bạn chỉ có thể xác nhận đơn của cửa hàng mình');
    }
    await this.orderRepository.setOrderPendingPriceConfirm(orderId, false);
    return { orderId, pendingPriceConfirm: false };
  }

  async forceCancelOrder(orderId: string, user: IJwtPayload) {
    const allowed = [
      UserRole.SUPPLY_COORDINATOR,
      UserRole.MANAGER,
      UserRole.ADMIN,
    ];
    if (!allowed.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }

    return this.orderRepository.runTransaction(async (tx) => {
      const order = await this.orderRepository.getOrderById(orderId, tx);
      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }
      const st = order.status as OrderStatus;
      if (
        st === OrderStatus.PENDING ||
        st === OrderStatus.CANCELLED ||
        st === OrderStatus.REJECTED
      ) {
        throw new BadRequestException(
          'Chỉ áp dụng hủy bắt buộc cho đơn đã duyệt / đang soạn. Đơn pending dùng hủy thường.',
        );
      }

      const centralWarehouseId =
        await this.orderRepository.getCentralWarehouseId(tx);
      if (!centralWarehouseId) {
        throw new InternalServerErrorException('Không tìm thấy kho trung tâm');
      }

      const shipment = await this.orderRepository.findShipmentByOrderId(
        orderId,
        tx,
      );
      if (shipment) {
        await this.orderRepository.releaseReservationsForShipment(
          shipment.id,
          centralWarehouseId,
          tx,
        );
        await tx
          .update(schema.shipments)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.shipments.id, shipment.id));
      }

      await this.orderRepository.updateStatusWithReason(
        orderId,
        OrderStatus.CANCELLED,
        'Hủy bắt buộc bởi điều phối / quản lý',
        tx,
      );

      await this.orderRepository.insertRestockTask(
        orderId,
        shipment?.id ?? null,
        tx,
      );

      return {
        orderId,
        status: OrderStatus.CANCELLED,
        restockTaskCreated: true,
      };
    });
  }

  async getOrderDetails(orderId: string, user: IJwtPayload) {
    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    const isCoordinator =
      (user.role as UserRole) === UserRole.SUPPLY_COORDINATOR;

    const isManager = (user.role as UserRole) === UserRole.MANAGER;

    const isKitchen =
      (user.role as UserRole) === UserRole.CENTRAL_KITCHEN_STAFF;

    if (
      !isCoordinator &&
      !isManager &&
      !isKitchen &&
      order.storeId !== user.storeId
    ) {
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

  // API: Analytics Fulfillment Rate
  async getFulfillmentRate(query: FulfillmentRateQueryDto) {
    const data = await this.orderRepository.getFulfillmentAnalytics(
      query.storeId,
      query.from,
      query.to,
    );

    let totalReq = 0;
    let totalApp = 0;

    //Định kiểu cho mảng
    const shortfallReasons: ShortfallReason[] = [];

    data.forEach((row) => {
      totalReq += row.totalRequested || 0;
      totalApp += row.totalApproved || 0;

      if (row.shortfallQty && row.shortfallQty > 0) {
        shortfallReasons.push({
          reason:
            row.reason || 'Không rõ lý do (Hết hàng/Không đạt chất lượng)',
          shortfallQuantity: row.shortfallQty,
        });
      }
    });

    // 1. Core Formula: (Total Approved / Total Requested) * 100
    const fillRate = totalReq > 0 ? (totalApp / totalReq) * 100 : 0;

    return {
      kpi: {
        fillRatePercentage: parseFloat(fillRate.toFixed(2)),
        totalRequestedQty: totalReq,
        totalApprovedQty: totalApp,
      },
      // 2. No Backorder Logic: Thống kê lý do hụt hàng
      shortfallAnalysis: shortfallReasons,
    };
  }

  // --- API : Analytics SLA ---
  async getFulfillmentSla(query: SlaQueryDto) {
    const data = await this.orderRepository.getSlaAnalytics(
      query.from,
      query.to,
    );

    let totalReview = 0,
      countReview = 0;
    let totalPicking = 0,
      countPicking = 0;
    let totalDelivery = 0,
      countDelivery = 0;

    data.forEach((row) => {
      // 1. Review Time: Order creation -> Shipment creation (Khi duyệt đơn)
      if (row.orderCreatedAt && row.shipmentCreatedAt) {
        totalReview +=
          row.shipmentCreatedAt.getTime() - row.orderCreatedAt.getTime();
        countReview++;
      }

      // 2. Picking Time: Shipment creation -> shipDate (Khi bắt đầu vận chuyển)
      if (row.shipmentCreatedAt && row.shipDate) {
        totalPicking +=
          row.shipDate.getTime() - row.shipmentCreatedAt.getTime();
        countPicking++;
      }

      // 3. Delivery Time: shipDate -> shipmentUpdatedAt (Khi status='completed')
      if (
        row.shipDate &&
        row.shipmentUpdatedAt &&
        row.shipmentStatus === 'completed'
      ) {
        totalDelivery +=
          row.shipmentUpdatedAt.getTime() - row.shipDate.getTime();
        countDelivery++;
      }
    });

    const msToHours = (ms: number) =>
      parseFloat((ms / (1000 * 60 * 60)).toFixed(2));

    return {
      kpi: {
        avgReviewTimeHours:
          countReview > 0 ? msToHours(totalReview / countReview) : 0,
        avgPickingTimeHours:
          countPicking > 0 ? msToHours(totalPicking / countPicking) : 0,
        avgDeliveryTimeHours:
          countDelivery > 0 ? msToHours(totalDelivery / countDelivery) : 0,
      },
      totalOrdersAnalyzed: data.length,
    };
  }

  async kitchenProductionConfirm(
    orderId: string,
    user: IJwtPayload,
    dto: { isAccepted: boolean; expectedBatchCode?: string },
  ) {
    const allowed = [UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN];
    if (!allowed.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }

    const order = await this.orderRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Đơn không ở trạng thái chờ xử lý',
      );
    }

    if (!order.requiresProductionConfirm) {
      throw new BadRequestException('Đơn không yêu cầu xác nhận bếp.');
    }

    if (!dto.isAccepted) {
      return this.approveOrder(orderId, true, { production_confirm: true });
    }

    return this.orderRepository.runTransaction(async (tx) => {
      const note = dto.expectedBatchCode
        ? [order.note, `Lô dự kiến: ${dto.expectedBatchCode}`]
            .filter(Boolean)
            .join(' | ')
        : order.note;

      await tx
        .update(schema.orders)
        .set({
          status: OrderStatus.WAITING_FOR_PRODUCTION,
          requiresProductionConfirm: false,
          note,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId));

      await this.orderRepository.insertRestockTask(orderId, null, tx);

      return {
        orderId,
        status: OrderStatus.WAITING_FOR_PRODUCTION,
      };
    });
  }
}
