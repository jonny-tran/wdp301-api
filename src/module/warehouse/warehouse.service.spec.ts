import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { UnitOfWork } from '../../database/unit-of-work';
import * as schema from '../../database/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { OrderRepository } from '../order/order.repository';
import { SystemConfigService } from '../system-config/system-config.service';
import { OrderStatus } from '../order/constants/order-status.enum';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepo: jest.Mocked<Partial<WarehouseRepository>>;
  let uow: { runInTransaction: jest.Mock };
  let inventoryRepository: jest.Mocked<Partial<InventoryRepository>>;
  let inventoryService: jest.Mocked<Partial<InventoryService>>;
  let orderRepository: jest.Mocked<Partial<OrderRepository>>;

  beforeEach(async () => {
    uow = { runInTransaction: jest.fn() };
    inventoryRepository = {
      decreasePhysicalAndReserved: jest.fn().mockResolvedValue(undefined),
      createInventoryTransaction: jest.fn().mockResolvedValue(undefined),
      syncBatchTotalsFromInventory: jest.fn().mockResolvedValue(undefined),
      updateBatchStatus: jest.fn().mockResolvedValue(undefined),
    };
    inventoryService = {
      releaseStockForShipment: jest.fn().mockResolvedValue(undefined),
      releaseStock: jest.fn().mockResolvedValue(undefined),
    };

    orderRepository = {
      getOrderById: jest.fn(),
      findShipmentByOrderId: jest.fn(),
      updateStatusWithReason: jest.fn().mockResolvedValue(undefined),
    };

    warehouseRepo = {
      findCentralWarehouseId: jest.fn(),
      createWarehouse: jest.fn(),
      findApprovedOrders: jest.fn(),
      findShipmentByOrderId: jest.fn(),
      findShipmentById: jest.fn(),
      findBatchWithInventory: jest.fn(),
      findInventory: jest.fn(),
      findShipmentItemByBatch: jest.fn(),
      replaceDamagedBatchTransaction: jest.fn(),
      decreaseStockFinal: jest.fn(),
      findShipmentsReadyForManifest: jest.fn(),
      syncPickingListPickedTotals: jest.fn().mockResolvedValue(undefined),
      findManifestById: jest.fn(),
      findShipmentItemById: jest.fn(),
    };

    const mockSystemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue('TRUE'),
      findAll: jest.fn(),
      refreshCache: jest.fn(),
      updateConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: WarehouseRepository, useValue: warehouseRepo },
        {
          provide: DATABASE_CONNECTION,
          useValue: {
            query: {},
            transaction: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: SystemConfigService,
          useValue: mockSystemConfigService,
        },
        { provide: UnitOfWork, useValue: uow },
        { provide: InventoryRepository, useValue: inventoryRepository },
        { provide: InventoryService, useValue: inventoryService },
        { provide: OrderRepository, useValue: orderRepository },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cancelPickingTask', () => {
    const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const mockTx = () =>
      ({
        query: {
          manifests: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        },
        update: jest.fn(() => ({
          set: () => ({ where: () => Promise.resolve() }),
        })),
      }) as never;

    beforeEach(() => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });
      (uow.runInTransaction as jest.Mock).mockImplementation(async (fn) =>
        fn(mockTx()),
      );
      (orderRepository.getOrderById as jest.Mock).mockResolvedValue({
        id: orderId,
        status: OrderStatus.APPROVED,
      });
      (orderRepository.findShipmentByOrderId as jest.Mock).mockResolvedValue({
        id: 'ship-1',
        status: 'preparing',
        manifestId: null,
      });
    });

    it('releases stock, cancels shipment and order with cancel_reason path', async () => {
      const result = await service.cancelPickingTask(
        orderId,
        'staff-uuid',
        'Thiếu hàng thực tế tại kệ',
      );

      expect(result).toEqual({
        orderId,
        status: OrderStatus.CANCELLED,
      });
      expect(inventoryService.releaseStock).toHaveBeenCalledWith(
        orderId,
        expect.anything(),
      );
      expect(orderRepository.updateStatusWithReason).toHaveBeenCalledWith(
        orderId,
        OrderStatus.CANCELLED,
        'Thiếu hàng thực tế tại kệ',
        expect.anything(),
      );
    });

    it('throws BadRequest when reason too short', async () => {
      await expect(
        service.cancelPickingTask(orderId, 'staff-uuid', 'ab'),
      ).rejects.toThrow(BadRequestException);
      expect(uow.runInTransaction).not.toHaveBeenCalled();
    });

    it('throws when order not approved/picking', async () => {
      (orderRepository.getOrderById as jest.Mock).mockResolvedValue({
        id: orderId,
        status: OrderStatus.DELIVERING,
      });
      await expect(
        service.cancelPickingTask(orderId, 'staff-uuid', 'Lý do đủ dài'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCentralWarehouseId', () => {
    it('should return warehouse id when found', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });

      const id = await service.getCentralWarehouseId();

      expect(id).toBe(1);
    });

    it('should throw NotFoundException when not found with Vietnamese message', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.getCentralWarehouseId()).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCentralWarehouseId()).rejects.toThrow(
        'Không tìm thấy Kho Trung Tâm trong hệ thống.',
      );
    });
  });

  describe('WH-OPTIMIZE manifest', () => {
    it('createManifest aggregates five orders of 2kg into one picking line of 10kg', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });
      const orderIds = [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      ];
      const orders = orderIds.map((id) => ({ id, status: 'approved' }));
      const shipments = orderIds.map((_, i) => ({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        items: [
          {
            id: i + 1,
            batchId: 50,
            batch: { productId: 100, product: { id: 100 } },
            quantity: '2',
          },
        ],
      }));

      const pickingListItemPayloads: Array<Record<string, unknown>> = [];

      (uow.runInTransaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          query: {
            orders: {
              findMany: jest.fn().mockResolvedValue(orders),
            },
            manifests: {
              findFirst: jest.fn(),
            },
            shipments: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            pickingLists: {
              findFirst: jest.fn(),
            },
          },
          insert: jest.fn((table: unknown) => {
            if (table === schema.pickingListItems) {
              return {
                values: (v: Record<string, unknown>) => {
                  pickingListItemPayloads.push(v);
                  return Promise.resolve();
                },
              };
            }
            return {
              values: () => ({
                returning: () => {
                  if (table === schema.manifests) {
                    return Promise.resolve([
                      { id: 1, code: 'MAN-TEST', status: 'preparing' },
                    ]);
                  }
                  if (table === schema.pickingLists) {
                    return Promise.resolve([{ id: 99 }]);
                  }
                  return Promise.resolve([]);
                },
              }),
            };
          }),
          update: jest.fn(() => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          })),
          execute: jest.fn().mockResolvedValue(undefined),
        };

        (warehouseRepo.findShipmentsReadyForManifest as jest.Mock).mockResolvedValue(
          shipments,
        );

        return fn(tx as never);
      });

      await service.createManifest({ orderIds });

      expect(pickingListItemPayloads).toHaveLength(1);
      expect(pickingListItemPayloads[0].productId).toBe(100);
      expect(pickingListItemPayloads[0].totalPlannedQuantity).toBe('10.00');
    });

    it('verifyManifestItem rejects scan when batch is not the suggested FEFO batch', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });

      (uow.runInTransaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          query: {
            shipments: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 's1', manifestId: 7 }),
            },
          },
          update: jest.fn(() => ({
            set: () => ({ where: () => Promise.resolve() }),
          })),
        };

        (warehouseRepo.findShipmentItemById as jest.Mock).mockResolvedValue({
          id: 42,
          shipmentId: 's1',
          batchId: 1,
          suggestedBatchId: 1,
          quantity: '5',
          batch: { productId: 10 },
        });

        return fn(tx as never);
      });

      await expect(
        service.verifyManifestItem(7, {
          shipmentItemId: 42,
          scannedBatchId: 999,
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.verifyManifestItem(7, {
          shipmentItemId: 42,
          scannedBatchId: 999,
        }),
      ).rejects.toThrow('Sai lô hàng! Bạn phải lấy lô cũ nhất theo chỉ định.');
    });

    it('cancelManifest releases reserved stock for all shipments', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });

      (uow.runInTransaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          query: {
            manifests: {
              findFirst: jest.fn().mockResolvedValue({
                id: 3,
                status: 'preparing',
              }),
            },
            shipments: {
              findMany: jest.fn().mockResolvedValue([
                { id: 'sh-a', fromWarehouseId: 1 },
                { id: 'sh-b', fromWarehouseId: 1 },
              ]),
            },
          },
          update: jest.fn(() => ({
            set: () => ({ where: () => Promise.resolve() }),
          })),
        };
        return fn(tx as never);
      });

      await service.cancelManifest(3);

      expect(inventoryService.releaseStockForShipment).toHaveBeenCalledTimes(2);
      expect(inventoryService.releaseStockForShipment).toHaveBeenCalledWith(
        'sh-a',
        1,
        expect.anything(),
      );
    });

    it('confirmManifestDeparture rolls back when inventory deduction fails mid-manifest', async () => {
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });

      let call = 0;
      (inventoryRepository.decreasePhysicalAndReserved as jest.Mock).mockImplementation(
        () => {
          call += 1;
          if (call === 2) {
            return Promise.reject(new Error('simulated DB failure'));
          }
          return Promise.resolve();
        },
      );

      (uow.runInTransaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          execute: jest.fn().mockResolvedValue(undefined),
          query: {
            manifests: {
              findFirst: jest.fn().mockResolvedValue({
                id: 1,
                status: 'preparing',
              }),
            },
            shipments: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'sh1',
                  orderId: 'o1',
                  fromWarehouseId: 1,
                  items: [
                    {
                      id: 1,
                      batchId: 10,
                      quantity: '1',
                      actualBatchId: 10,
                    },
                    {
                      id: 2,
                      batchId: 11,
                      quantity: '1',
                      actualBatchId: 11,
                    },
                  ],
                },
              ]),
            },
            pickingLists: {
              findFirst: jest.fn().mockResolvedValue({ id: 5 }),
            },
          },
          update: jest.fn(() => ({
            set: () => ({ where: () => Promise.resolve() }),
          })),
        };
        return fn(tx as never);
      });

      await expect(service.confirmManifestDeparture(1)).rejects.toThrow(
        'simulated DB failure',
      );
      expect(inventoryRepository.decreasePhysicalAndReserved).toHaveBeenCalled();
    });
  });
});
