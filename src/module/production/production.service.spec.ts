/* eslint-disable @typescript-eslint/unbound-method */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { UnitOfWork } from '../../database/unit-of-work';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProductRepository } from '../product/product.repository';
import { ProductionRepository } from './production.repository';
import { ProductionService } from './production.service';

describe('ProductionService', () => {
  let service: ProductionService;
  let repo: jest.Mocked<ProductionRepository>;
  let inboundRepo: jest.Mocked<InboundRepository>;
  let productRepo: jest.Mocked<ProductRepository>;
  let inventoryRepo: jest.Mocked<InventoryRepository>;
  let mockTx: unknown;

  beforeEach(async () => {
    mockTx = {};

    const mockRepo = {
      findRecipeWithItems: jest.fn(),
      createProductionOrder: jest.fn(),
      findOrderById: jest.fn(),
      listAvailableInventoryFefo: jest.fn(),
      updateReservedQuantity: jest.fn(),
      insertReservation: jest.fn(),
      updateOrderStatus: jest.fn(),
      decreaseStockAndReserved: jest.fn(),
    };

    const mockInbound = {
      nextBatchCode: jest.fn(),
      insertBatch: jest.fn(),
      updateBatchStatus: jest.fn(),
      upsertInventory: jest.fn(),
    };

    const mockProduct = {
      findById: jest.fn(),
    };

    const mockInventory = {
      createInventoryTransaction: jest.fn(),
    };

    const mockUow = {
      runInTransaction: jest.fn(async <T>(work: (tx: unknown) => Promise<T>) => {
        return work(mockTx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: ProductionRepository, useValue: mockRepo },
        { provide: UnitOfWork, useValue: mockUow },
        { provide: InboundRepository, useValue: mockInbound },
        { provide: ProductRepository, useValue: mockProduct },
        { provide: InventoryRepository, useValue: mockInventory },
      ],
    }).compile();

    service = module.get(ProductionService);
    repo = module.get(ProductionRepository);
    inboundRepo = module.get(InboundRepository);
    productRepo = module.get(ProductRepository);
    inventoryRepo = module.get(InventoryRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create draft production order when recipe exists and active', async () => {
      repo.findRecipeWithItems.mockResolvedValue({
        id: 1,
        isActive: true,
      } as never);
      repo.createProductionOrder.mockResolvedValue({
        id: 'po-1',
        status: 'draft',
      } as never);

      const result = await service.createOrder({
        recipeId: 1,
        outputQuantity: 10,
        warehouseId: 2,
        createdBy: 'user-1',
      });

      expect(repo.findRecipeWithItems).toHaveBeenCalledWith(1);
      expect(repo.createProductionOrder).toHaveBeenCalledWith({
        recipeId: 1,
        warehouseId: 2,
        outputQuantity: '10',
        status: 'draft',
        createdBy: 'user-1',
      });
      expect(result).toEqual({ id: 'po-1', status: 'draft' });
    });

    it('should throw NotFoundException when recipe missing or inactive', async () => {
      repo.findRecipeWithItems.mockResolvedValue(null);

      await expect(
        service.createOrder({
          recipeId: 99,
          outputQuantity: 1,
          warehouseId: 1,
          createdBy: 'u',
        }),
      ).rejects.toThrow(NotFoundException);

      repo.findRecipeWithItems.mockResolvedValue({ id: 1, isActive: false } as never);

      await expect(
        service.createOrder({
          recipeId: 1,
          outputQuantity: 1,
          warehouseId: 1,
          createdBy: 'u',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('startProduction', () => {
    const orderId = 'order-1';

    it('should throw NotFoundException when order not found', async () => {
      repo.findOrderById.mockResolvedValue(undefined);

      await expect(service.startProduction(orderId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when order is not draft', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'in_progress',
        warehouseId: 1,
        outputQuantity: '1',
        recipe: { items: [] },
      } as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when recipe has no items', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        outputQuantity: '1',
        recipe: { items: [] },
      } as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(BadRequestException);
    });

    it('should throw InsufficientStockException when FEFO cannot cover need', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        outputQuantity: '10',
        recipe: {
          items: [{ ingredientProductId: 5, quantityPerOutput: '2' }],
        },
      } as never);
      repo.listAvailableInventoryFefo.mockResolvedValue([
        {
          inventory: {
            id: 1,
            quantity: '5',
            reservedQuantity: '0',
          },
          batch: { id: 10 },
        },
      ] as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(InsufficientStockException);
      expect(repo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('should reserve FEFO batches and set order to in_progress', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        outputQuantity: '10',
        recipe: {
          items: [{ ingredientProductId: 5, quantityPerOutput: '2' }],
        },
      } as never);
      repo.listAvailableInventoryFefo.mockResolvedValue([
        {
          inventory: {
            id: 1,
            quantity: '15',
            reservedQuantity: '0',
          },
          batch: { id: 101 },
        },
        {
          inventory: {
            id: 2,
            quantity: '10',
            reservedQuantity: '0',
          },
          batch: { id: 102 },
        },
      ] as never);

      const result = await service.startProduction(orderId);

      expect(repo.listAvailableInventoryFefo).toHaveBeenCalledWith(mockTx, 1, 5);
      expect(repo.updateReservedQuantity).toHaveBeenNthCalledWith(1, mockTx, 1, 15);
      expect(repo.insertReservation).toHaveBeenNthCalledWith(1, mockTx, {
        productionOrderId: orderId,
        batchId: 101,
        reservedQuantity: '15',
      });
      expect(repo.updateReservedQuantity).toHaveBeenNthCalledWith(2, mockTx, 2, 5);
      expect(repo.insertReservation).toHaveBeenNthCalledWith(2, mockTx, {
        productionOrderId: orderId,
        batchId: 102,
        reservedQuantity: '5',
      });
      expect(repo.updateOrderStatus).toHaveBeenCalledWith(mockTx, orderId, 'in_progress');
      expect(result).toEqual({ message: 'Đã tạm giữ nguyên liệu (FEFO)' });
    });
  });

  describe('finishProduction', () => {
    const orderId = 'order-1';

    it('should throw NotFoundException when order not found', async () => {
      repo.findOrderById.mockResolvedValue(undefined);

      await expect(service.finishProduction(orderId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when order is not in_progress', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        recipe: { outputProductId: 1 },
        reservations: [],
      } as never);

      await expect(service.finishProduction(orderId)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when output product missing', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'in_progress',
        warehouseId: 1,
        outputQuantity: '3',
        recipe: { outputProductId: 100 },
        reservations: [],
      } as never);
      productRepo.findById.mockResolvedValue(undefined);

      await expect(service.finishProduction(orderId)).rejects.toThrow(NotFoundException);
    });

    it('should consume reservations, create batch, upsert inventory, log production_consume and production_output', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'in_progress',
        warehouseId: 7,
        outputQuantity: '4',
        recipe: { outputProductId: 100 },
        reservations: [
          { batchId: 11, reservedQuantity: '2.5' },
          { batchId: 12, reservedQuantity: '1.5' },
        ],
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
      } as never);
      inboundRepo.nextBatchCode.mockResolvedValue('BAT-TP-001');
      inboundRepo.insertBatch.mockResolvedValue({
        id: 200,
        batchCode: 'BAT-TP-001',
      } as never);

      const result = await service.finishProduction(orderId);

      expect(repo.decreaseStockAndReserved).toHaveBeenNthCalledWith(1, mockTx, 7, 11, 2.5);
      expect(repo.decreaseStockAndReserved).toHaveBeenNthCalledWith(2, mockTx, 7, 12, 1.5);
      expect(inventoryRepo.createInventoryTransaction).toHaveBeenNthCalledWith(
        1,
        7,
        11,
        'production_consume',
        -2.5,
        `PRODUCTION:${orderId}`,
        'Tiêu hao nguyên liệu sản xuất',
        mockTx,
      );
      expect(inventoryRepo.createInventoryTransaction).toHaveBeenNthCalledWith(
        2,
        7,
        12,
        'production_consume',
        -1.5,
        `PRODUCTION:${orderId}`,
        'Tiêu hao nguyên liệu sản xuất',
        mockTx,
      );

      expect(inboundRepo.nextBatchCode.mock.invocationCallOrder[0]).toBeLessThan(
        inboundRepo.insertBatch.mock.invocationCallOrder[0],
      );

      expect(inboundRepo.insertBatch).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          productId: 100,
          batchCode: 'BAT-TP-001',
          manufacturedDate: expect.any(String),
          expiryDate: expect.any(String),
        }),
      );
      expect(inboundRepo.updateBatchStatus).toHaveBeenCalledWith(mockTx, 200, 'available');
      expect(inboundRepo.upsertInventory).toHaveBeenCalledWith(mockTx, 7, 200, '4');
      expect(inventoryRepo.createInventoryTransaction).toHaveBeenNthCalledWith(
        3,
        7,
        200,
        'production_output',
        4,
        `PRODUCTION:${orderId}`,
        'Thành phẩm sau sản xuất',
        mockTx,
      );
      expect(repo.updateOrderStatus).toHaveBeenCalledWith(mockTx, orderId, 'completed');
      expect(result).toEqual({ batchId: 200, batchCode: 'BAT-TP-001' });
    });
  });
});
