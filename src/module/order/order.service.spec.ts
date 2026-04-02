/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../auth/dto/create-user.dto';
import { IJwtPayload } from '../auth/types/auth.types';
import { ShipmentService } from '../shipment/shipment.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { OrderStatus } from './constants/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { InventoryService } from '../inventory/inventory.service';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<OrderRepository>;
  let shipmentService: jest.Mocked<ShipmentService>;
  let systemConfigService: jest.Mocked<SystemConfigService>;
  let inventoryService: jest.Mocked<Pick<InventoryService, 'lockStockForOrder'>>;
  let mockTx: jest.Mocked<OrderRepository>;

  beforeEach(async () => {
    const mockOrderRepoObj = {
      getOrderCatalogProducts: jest.fn(),
      findAll: jest.fn(),
      findActiveProductsByIds: jest.fn(),
      findProductsWithSnapshotByIds: jest.fn(),
      hasStaleUnconfirmedShipment: jest.fn().mockResolvedValue(false),
      getStoreById: jest.fn(),
      sumStoreInventoryByProduct: jest.fn(),
      findExistingConsolidationGroupId: jest.fn().mockResolvedValue(null),
      acquireStoreOrderingLock: jest.fn().mockResolvedValue(undefined),
      lockStoreInventoryRowsForProducts: jest.fn().mockResolvedValue(undefined),
      insertOrderWithItems: jest.fn(),
      getOrdersByStore: jest.fn(),
      getOrdersForCoordinator: jest.fn(),
      getOrderById: jest.fn(),
      getCentralWarehouseId: jest.fn(),
      getBatchesForFEFO: jest.fn(),
      reserveInventory: jest.fn(),
      updateOrderItemApprovedQuantity: jest.fn(),
      updateStatusWithReason: jest.fn(),
      updateOrderApproved: jest.fn(),
      getStoreWarehouseId: jest.fn(),
      getFulfillmentAnalytics: jest.fn(),
      getSlaAnalytics: jest.fn(),
      setOrderProductionFlag: jest.fn(),
      setOrderPendingPriceConfirm: jest.fn(),
      runTransaction: jest.fn(
        async (cb: (tx: jest.Mocked<OrderRepository>) => Promise<unknown>) =>
          cb(mockTx),
      ),
    };

    mockTx = mockOrderRepoObj as unknown as jest.Mocked<OrderRepository>;

    const mockShipmentServiceObj = {
      createShipmentForOrder: jest.fn(),
    };

    const mockSystemConfigServiceObj = {
      getConfigValue: jest.fn().mockResolvedValue(null), // Default: no closing time check
      getValues: jest.fn().mockResolvedValue({
        DEFAULT_PREP_TIME_HOURS: null,
        DEFAULT_TRANSIT_TIME_HOURS: null,
      }),
      findAll: jest.fn(),
      refreshCache: jest.fn(),
      updateConfig: jest.fn(),
    };

    const mockInventoryServiceObj = {
      lockStockForOrder: jest.fn(),
      releaseStockForShipment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: OrderRepository,
          useValue: mockOrderRepoObj,
        },
        {
          provide: ShipmentService,
          useValue: mockShipmentServiceObj,
        },
        {
          provide: SystemConfigService,
          useValue: mockSystemConfigServiceObj,
        },
        {
          provide: InventoryService,
          useValue: mockInventoryServiceObj,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepo = module.get(OrderRepository);
    shipmentService = module.get(ShipmentService);
    systemConfigService = module.get(SystemConfigService);
    inventoryService = module.get(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const user: IJwtPayload = {
      sub: 'u-1',
      storeId: 's-1',
      role: UserRole.FRANCHISE_STORE_STAFF,
      email: 'a@a.com',
    };

    it('should create an order successfully (Happy Path)', async () => {
      const dto: CreateOrderDto = {
        deliveryDate: '2026-05-01',
        items: [{ productId: 1, quantity: 10 }],
      };

      orderRepo.findActiveProductsByIds.mockResolvedValue([
        { id: 1 },
      ] as never[]);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        {
          id: 1,
          unitPrice: '50000',
          prepTimeHours: 24,
          packagingInfo: 'Thùng 10kg',
          isHighValue: false,
          weightKg: '1',
          volumeM3: '0.01',
          unitName: 'kg',
        },
      ] as never[]);
      orderRepo.getStoreById.mockResolvedValue({
        id: 's-1',
        transitTimeHours: 24,
        maxStorageCapacity: null,
      } as never);
      orderRepo.getStoreWarehouseId.mockResolvedValue(1 as never);
      orderRepo.sumStoreInventoryByProduct.mockResolvedValue(new Map([[1, 5]]));

      const createdOrder = {
        id: 'o-1',
        storeId: 's-1',
        status: OrderStatus.PENDING,
        deliveryDate: new Date('2026-05-01'),
        createdAt: new Date(),
      };
      orderRepo.insertOrderWithItems.mockResolvedValue(createdOrder as never);

      const result = await service.createOrder(user, dto);
      expect(result.id).toBe('o-1');
      expect(orderRepo.findActiveProductsByIds).toHaveBeenCalledWith([1], {
        orderableOnly: true,
      });
      expect(orderRepo.insertOrderWithItems).toHaveBeenCalled();
    });

    it('should throw BadRequestException if items array is empty', async () => {
      const dto: CreateOrderDto = {
        deliveryDate: '2026-05-01',
        items: [],
      };

      await expect(service.createOrder(user, dto)).rejects.toThrow(
        new BadRequestException('Đơn hàng phải có ít nhất một sản phẩm'),
      );
    });

    it('should throw BadRequestException if user has no storeId', async () => {
      const invalidUser = { ...user, storeId: undefined };
      const dto: CreateOrderDto = {
        deliveryDate: '2026-05-01',
        items: [{ productId: 1, quantity: 10 }],
      };

      await expect(
        service.createOrder(invalidUser as IJwtPayload, dto),
      ).rejects.toThrow(
        new BadRequestException(
          'Người dùng không thuộc về bất kỳ cửa hàng nào',
        ),
      );
    });

    it('should throw BadRequestException if deliveryDate is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2); // 2 days ago
      const dto: CreateOrderDto = {
        deliveryDate: pastDate.toISOString(),
        items: [{ productId: 1, quantity: 10 }],
      };

      await expect(service.createOrder(user, dto)).rejects.toThrow(
        new BadRequestException('Ngày giao hàng không hợp lệ'),
      );
    });

    it('should create order after ORDER_CLOSING_TIME (service điều chỉnh ngày giao / group)', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('00:01');

      const dto: CreateOrderDto = {
        deliveryDate: '2030-05-01',
        items: [{ productId: 1, quantity: 10 }],
      };

      orderRepo.findActiveProductsByIds.mockResolvedValue([
        { id: 1 },
      ] as never[]);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        {
          id: 1,
          unitPrice: '50000',
          prepTimeHours: 24,
          packagingInfo: 'Thùng 10kg',
          isHighValue: false,
          weightKg: '1',
          volumeM3: '0.01',
          unitName: 'kg',
        },
      ] as never[]);
      orderRepo.getStoreById.mockResolvedValue({
        id: 's-1',
        transitTimeHours: 24,
        maxStorageCapacity: null,
      } as never);
      orderRepo.getStoreWarehouseId.mockResolvedValue(1 as never);
      orderRepo.sumStoreInventoryByProduct.mockResolvedValue(new Map([[1, 5]]));

      const createdOrder = {
        id: 'o-1',
        storeId: 's-1',
        status: OrderStatus.PENDING,
        deliveryDate: new Date('2030-05-01'),
        createdAt: new Date(),
      };
      orderRepo.insertOrderWithItems.mockResolvedValue(createdOrder as never);

      const result = await service.createOrder(user, dto);
      expect(result.id).toBe('o-1');
    });

    it('should allow order if ORDER_CLOSING_TIME is not configured', async () => {
      // getConfigValue returns null (not configured)
      systemConfigService.getConfigValue.mockResolvedValue(null);

      const dto: CreateOrderDto = {
        deliveryDate: '2026-05-01',
        items: [{ productId: 1, quantity: 10 }],
      };

      orderRepo.findActiveProductsByIds.mockResolvedValue([
        { id: 1 },
      ] as never[]);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        {
          id: 1,
          unitPrice: '50000',
          prepTimeHours: 24,
          packagingInfo: null,
          isHighValue: false,
          weightKg: '1',
          volumeM3: '0.01',
          unitName: 'kg',
        },
      ] as never[]);
      orderRepo.getStoreById.mockResolvedValue({
        id: 's-1',
        transitTimeHours: 24,
        maxStorageCapacity: null,
      } as never);
      orderRepo.getStoreWarehouseId.mockResolvedValue(1 as never);
      orderRepo.sumStoreInventoryByProduct.mockResolvedValue(new Map([[1, 0]]));

      const createdOrder = {
        id: 'o-1',
        storeId: 's-1',
        status: OrderStatus.PENDING,
        deliveryDate: new Date('2026-05-01'),
        createdAt: new Date(),
      };
      orderRepo.insertOrderWithItems.mockResolvedValue(createdOrder as never);

      const result = await service.createOrder(user, dto);
      expect(result.id).toBe('o-1');
    });
  });

  describe('approveOrder (No Backorders & Partial Fulfillment)', () => {
    it('should full fulfill if stock >= requested', async () => {
      const orderId = 'o-1';
      const order = {
        id: orderId,
        status: OrderStatus.PENDING,
        storeId: 's-1',
        consolidationGroupId: null as string | null,
        store: { transitTimeHours: 24 },
        items: [
          {
            id: 10,
            productId: 1,
            quantityRequested: '10',
            priceSnapshot: '50000',
          },
        ],
      };
      mockTx.getOrderById.mockResolvedValue(order as never);
      mockTx.getCentralWarehouseId.mockResolvedValue(99 as never);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        { id: 1, unitPrice: '50000', prepTimeHours: 24 },
      ] as never[]);
      mockTx.getStoreWarehouseId.mockResolvedValue(88 as never);
      mockTx.setOrderProductionFlag.mockResolvedValue(undefined as never);
      mockTx.setOrderPendingPriceConfirm.mockResolvedValue(undefined as never);
      systemConfigService.getConfigValue.mockResolvedValue(null);
      inventoryService.lockStockForOrder.mockResolvedValue({
        shipmentItems: [{ batchId: 5, quantity: 10 }],
        results: [
          {
            orderItemId: 10,
            productId: 1,
            requested: 10,
            approved: 10,
            missing: 0,
          },
        ],
      });

      const result = await service.approveOrder(orderId);

      expect(mockTx.updateOrderItemApprovedQuantity).toHaveBeenCalledWith(
        10,
        '10',
        mockTx,
      );
      expect(result.status).toBe(OrderStatus.APPROVED);
      expect(result.results[0].approved).toBe(10);
      expect(result.results[0].missing).toBe(0);
      expect(shipmentService.createShipmentForOrder).toHaveBeenCalled();
    });

    it('should partial fulfill if stock < requested (No Backorder)', async () => {
      // Store placed 100 but inventory only has 60
      const orderId = 'o-1';
      const order = {
        id: orderId,
        status: OrderStatus.PENDING,
        storeId: 's-1',
        consolidationGroupId: null as string | null,
        store: { transitTimeHours: 24 },
        items: [
          {
            id: 10,
            productId: 1,
            quantityRequested: '100',
            priceSnapshot: '50000',
          },
        ],
      };
      mockTx.getOrderById.mockResolvedValue(order as never);
      mockTx.getCentralWarehouseId.mockResolvedValue(99 as never);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        { id: 1, unitPrice: '50000', prepTimeHours: 24 },
      ] as never[]);
      mockTx.getStoreWarehouseId.mockResolvedValue(88 as never);
      mockTx.setOrderProductionFlag.mockResolvedValue(undefined as never);
      mockTx.setOrderPendingPriceConfirm.mockResolvedValue(undefined as never);
      systemConfigService.getConfigValue.mockResolvedValue(null);
      inventoryService.lockStockForOrder.mockResolvedValue({
        shipmentItems: [{ batchId: 5, quantity: 60 }],
        results: [
          {
            orderItemId: 10,
            productId: 1,
            requested: 100,
            approved: 60,
            missing: 40,
          },
        ],
      });

      const result = await service.approveOrder(orderId, true, {
        production_confirm: true,
      }); // force fill + production confirm for partial shortage

      expect(mockTx.updateOrderItemApprovedQuantity).toHaveBeenCalledWith(
        10,
        '60',
        mockTx,
      );
      expect(result.status).toBe(OrderStatus.APPROVED);
      expect(result.results[0].approved).toBe(60);
      expect(result.results[0].missing).toBe(40);
      // Ensure no backorder is created (we only update the approved quantity and dispatch)
      expect(mockTx.updateOrderApproved).toHaveBeenCalledWith(order.id, mockTx);
      expect(shipmentService.createShipmentForOrder).toHaveBeenCalled();
    });

    it('should throw NotFoundException if order not found', async () => {
      mockTx.getOrderById.mockResolvedValue(null as never);
      await expect(service.approveOrder('invalid')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.approveOrder('invalid')).rejects.toThrow(
        'Không tìm thấy đơn hàng',
      );
    });

    it('should throw BadRequestException if order status is not PENDING', async () => {
      mockTx.getOrderById.mockResolvedValue({
        status: OrderStatus.APPROVED,
      } as never);
      await expect(service.approveOrder('valid')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.approveOrder('valid')).rejects.toThrow(
        'Đơn hàng không ở trạng thái chờ xử lý',
      );
    });
  });

  describe('rejectOrder', () => {
    it('should reject order and update reason', async () => {
      orderRepo.getOrderById.mockResolvedValue({
        status: OrderStatus.PENDING,
      } as never);

      const result = await service.rejectOrder('o-1', 'Not enough stock');

      expect(orderRepo.updateStatusWithReason).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.REJECTED,
        'Not enough stock',
      );
      expect(result.status).toBe(OrderStatus.REJECTED);
    });
  });

  describe('Data Isolation', () => {
    it('getOrderDetails should block access to other store orders', async () => {
      orderRepo.getOrderById.mockResolvedValue({
        id: 'o-2',
        storeId: 'store-diff',
      } as never);
      const user = {
        role: UserRole.FRANCHISE_STORE_STAFF,
        storeId: 'store-1',
      } as IJwtPayload;

      await expect(service.getOrderDetails('o-2', user)).rejects.toThrow(
        new ForbiddenException('Từ chối truy cập'),
      );
    });

    it('getOrderDetails should allow access to own store order', async () => {
      const mockOrder = {
        id: 'o-1',
        storeId: 'store-1',
      };
      orderRepo.getOrderById.mockResolvedValue(mockOrder as never);
      const user = {
        role: UserRole.FRANCHISE_STORE_STAFF,
        storeId: 'store-1',
      } as IJwtPayload;

      const result = await service.getOrderDetails('o-1', user);
      expect(result).toEqual(mockOrder);
    });
  });

  describe('cancelOrder (Store Action)', () => {
    const user = {
      role: UserRole.FRANCHISE_STORE_STAFF,
      storeId: 'store-1',
    } as IJwtPayload;

    it('should successfully cancel a PENDING order', async () => {
      orderRepo.getOrderById.mockResolvedValue({
        id: 'o-1',
        storeId: 'store-1',
        status: OrderStatus.PENDING,
      } as never);

      const result = await service.cancelOrder('o-1', user);

      expect(orderRepo.updateStatusWithReason).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.CANCELLED,
        'Hủy bởi nhân viên cửa hàng',
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      orderRepo.getOrderById.mockResolvedValue(null as never);

      await expect(service.cancelOrder('o-1', user)).rejects.toThrow(
        new NotFoundException('Không tìm thấy đơn hàng'),
      );
    });

    it('should throw ForbiddenException if order belongs to another store', async () => {
      orderRepo.getOrderById.mockResolvedValue({
        id: 'o-1',
        storeId: 'store-other',
        status: OrderStatus.PENDING,
      } as never);

      await expect(service.cancelOrder('o-1', user)).rejects.toThrow(
        new ForbiddenException('Bạn chỉ có thể hủy đơn hàng của cửa hàng mình'),
      );
    });

    it('should throw BadRequestException if order is not PENDING (e.g. APPROVED or SHIPPING)', async () => {
      orderRepo.getOrderById.mockResolvedValue({
        id: 'o-1',
        storeId: 'store-1',
        status: OrderStatus.APPROVED,
      } as never);

      await expect(service.cancelOrder('o-1', user)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reviewOrder (Coordinator Action)', () => {
    it('should review order without making any changes to database or state', async () => {
      const mockOrder = {
        id: 'o-1',
        storeId: 's-1',
        status: OrderStatus.PENDING,
        store: { name: 'KFC' },
        items: [
          {
            productId: 1,
            quantityRequested: '20',
            product: { name: 'Chicken' },
          },
        ],
      };

      orderRepo.getOrderById.mockResolvedValue(mockOrder as never);
      orderRepo.getCentralWarehouseId.mockResolvedValue(99 as never);
      orderRepo.getBatchesForFEFO.mockResolvedValue([
        { batchId: 5, quantity: '30', reservedQuantity: '5' }, // 25 available
      ] as never[]);

      const result = await service.reviewOrder('o-1');

      expect(orderRepo.getOrderById).toHaveBeenCalledWith('o-1');
      expect(orderRepo.getBatchesForFEFO).toHaveBeenCalledWith(1, 99);
      // No state updates
      expect(orderRepo.updateStatusWithReason).not.toHaveBeenCalled();
      expect(orderRepo.updateOrderApproved).not.toHaveBeenCalled();
      expect(orderRepo.runTransaction).not.toHaveBeenCalled();

      // Check Mapping
      expect(result.orderId).toBe('o-1');
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.items[0].currentStock).toBe(25);
      expect(result.items[0].canFulfill).toBe(true);
    });
  });

  describe('Analytics', () => {
    it('getFulfillmentRate should calculate strictly based on Repo mocks', async () => {
      const mockAnalytics = [
        {
          totalRequested: 100,
          totalApproved: 80,
          shortfallQty: 20,
          reason: 'Short',
        },
      ];
      orderRepo.getFulfillmentAnalytics.mockResolvedValue(
        mockAnalytics as never,
      );

      const result = await service.getFulfillmentRate({
        storeId: 's-1',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(orderRepo.getFulfillmentAnalytics).toHaveBeenCalledWith(
        's-1',
        '2026-01-01',
        '2026-01-31',
      );
      expect(result.kpi.fillRatePercentage).toBe(80);
      expect(result.kpi.totalRequestedQty).toBe(100);
      expect(result.kpi.totalApprovedQty).toBe(80);
      expect(result.shortfallAnalysis[0].shortfallQuantity).toBe(20);
    });

    it('getFulfillmentSla should calculate SLA hours based on Repo mocks', async () => {
      const mockSla = [
        {
          orderCreatedAt: new Date('2026-01-01T00:00:00Z'),
          shipmentCreatedAt: new Date('2026-01-01T01:30:00Z'),
          shipDate: new Date('2026-01-01T03:30:00Z'),
          shipmentUpdatedAt: new Date('2026-01-01T05:30:00Z'),
          shipmentStatus: 'completed',
        },
      ];
      orderRepo.getSlaAnalytics.mockResolvedValue(mockSla as never);

      const result = await service.getFulfillmentSla({
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(orderRepo.getSlaAnalytics).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-31',
      );
      // 1.5 hours review, 2 hours picking, 2 hours delivery
      expect(result.kpi.avgReviewTimeHours).toBe(1.5);
      expect(result.kpi.avgPickingTimeHours).toBe(2);
      expect(result.kpi.avgDeliveryTimeHours).toBe(2);
    });
  });

  describe('ORD-OPTIMIZE', () => {
    const user: IJwtPayload = {
      sub: 'u-1',
      storeId: 's-1',
      role: UserRole.FRANCHISE_STORE_STAFF,
      email: 'a@a.com',
    };

    it('should pass snapshot fields into insertOrderWithItems', async () => {
      const dto: CreateOrderDto = {
        deliveryDate: '2026-06-15',
        items: [{ productId: 1, quantity: 2 }],
      };
      orderRepo.findActiveProductsByIds.mockResolvedValue([{ id: 1 }] as never[]);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        {
          id: 1,
          unitPrice: '45000',
          prepTimeHours: 12,
          packagingInfo: 'Hộp 2kg',
          isHighValue: false,
          weightKg: '1',
          volumeM3: '0.01',
          unitName: 'kg',
        },
      ] as never[]);
      orderRepo.getStoreById.mockResolvedValue({
        id: 's-1',
        transitTimeHours: 12,
        maxStorageCapacity: null,
      } as never);
      orderRepo.getStoreWarehouseId.mockResolvedValue(10 as never);
      orderRepo.sumStoreInventoryByProduct.mockResolvedValue(new Map());
      orderRepo.insertOrderWithItems.mockResolvedValue({
        id: 'ord-snap',
        storeId: 's-1',
        status: OrderStatus.PENDING,
        deliveryDate: new Date(dto.deliveryDate),
        createdAt: new Date(),
      } as never);

      await service.createOrder(user, dto);

      expect(orderRepo.insertOrderWithItems).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          storeId: 's-1',
          items: expect.arrayContaining([
            expect.objectContaining({
              productId: 1,
              quantity: 2,
              unitSnapshot: 'kg',
              priceSnapshot: '45000.00',
              packagingInfoSnapshot: 'Hộp 2kg',
            }),
          ]),
          totalAmount: '90000.00',
          consolidationGroupId: expect.any(String),
        }),
      );
    });

    it('should throw BadRequestException when order qty + stock exceeds max storage capacity', async () => {
      const dto: CreateOrderDto = {
        deliveryDate: '2026-06-15',
        items: [{ productId: 1, quantity: 100 }],
      };
      orderRepo.findActiveProductsByIds.mockResolvedValue([{ id: 1 }] as never[]);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        {
          id: 1,
          unitPrice: '1',
          prepTimeHours: 24,
          packagingInfo: null,
          isHighValue: false,
          weightKg: '1',
          volumeM3: '0',
          unitName: 'kg',
        },
      ] as never[]);
      orderRepo.getStoreById.mockResolvedValue({
        id: 's-1',
        transitTimeHours: 24,
        maxStorageCapacity: '50',
      } as never);
      orderRepo.getStoreWarehouseId.mockResolvedValue(10 as never);
      orderRepo.sumStoreInventoryByProduct.mockResolvedValue(
        new Map([[1, 10]]),
      );

      await expect(service.createOrder(user, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ProductionConfirmNeeded path when partial shortage and no production_confirm', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-24T03:00:00.000Z'));

      const orderId = 'o-pc';
      const order = {
        id: orderId,
        status: OrderStatus.PENDING,
        storeId: 's-1',
        consolidationGroupId: null,
        store: { transitTimeHours: 0 },
        items: [
          {
            id: 1,
            productId: 1,
            quantityRequested: '10',
            priceSnapshot: '100',
          },
        ],
      };
      mockTx.getOrderById.mockResolvedValue(order as never);
      mockTx.getCentralWarehouseId.mockResolvedValue(1 as never);
      orderRepo.findProductsWithSnapshotByIds.mockResolvedValue([
        { id: 1, unitPrice: '100', prepTimeHours: 0 },
      ] as never[]);
      mockTx.setOrderProductionFlag.mockResolvedValue(undefined as never);
      systemConfigService.getConfigValue.mockResolvedValue('06:00');
      inventoryService.lockStockForOrder.mockResolvedValue({
        shipmentItems: [{ batchId: 1, quantity: 3 }],
        results: [
          {
            orderItemId: 1,
            productId: 1,
            requested: 10,
            approved: 3,
            missing: 7,
          },
        ],
      });

      await expect(service.approveOrder(orderId, false, {})).rejects.toMatchObject(
        {
          response: expect.objectContaining({
            code: 'PRODUCTION_CONFIRMATION_REQUIRED',
          }),
        },
      );
      expect(orderRepo.setOrderProductionFlag).toHaveBeenCalledWith(
        orderId,
        true,
      );

      jest.useRealTimers();
    });
  });
});
