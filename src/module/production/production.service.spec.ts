/* eslint-disable @typescript-eslint/unbound-method */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { UnitOfWork } from '../../database/unit-of-work';
import { UserRole } from '../auth/dto/create-user.dto';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProductType } from '../product/constants/product-type.enum';
import { InventoryService } from '../inventory/inventory.service';
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
      findActiveRecipesByOutputProductId: jest.fn(),
      createRecipe: jest.fn(),
      createProductionOrder: jest.fn(),
      generateNextProductionOrderCode: jest.fn(),
      findOrderById: jest.fn(),
      listAvailableInventoryFefo: jest.fn(),
      updateReservedQuantity: jest.fn(),
      insertReservation: jest.fn(),
      updateOrderStatus: jest.fn(),
      markOrderStarted: jest.fn(),
      markOrderCompleted: jest.fn(),
      insertBatchLineage: jest.fn(),
      decreaseStockAndReserved: jest.fn(),
      findBatchByCode: jest.fn().mockResolvedValue(undefined),
      findBatchById: jest.fn(),
    };

    const mockInventoryService = {
      lockSpecificBatch: jest.fn().mockResolvedValue(undefined),
    };

    const mockInbound = {
      lockBatchCodeGeneration: jest.fn().mockResolvedValue(undefined),
      insertBatch: jest.fn(),
      updateBatchStatus: jest.fn(),
      upsertInventory: jest.fn(),
    };

    const mockProduct = {
      findById: jest.fn(),
    };

    const mockInventory = {
      createInventoryTransaction: jest.fn(),
      syncBatchTotalsFromInventory: jest.fn().mockResolvedValue(undefined),
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
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    service = module.get(ProductionService);
    repo = module.get(ProductionRepository);
    inboundRepo = module.get(InboundRepository);
    productRepo = module.get(ProductRepository);
    inventoryRepo = module.get(InventoryRepository);

    repo.findRecipeWithItems.mockResolvedValue({
      id: 1,
      outputProductId: 99,
      items: [{ ingredientProductId: 5, quantityPerOutput: '2' }],
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create draft production order when recipe exists and active', async () => {
      repo.findActiveRecipesByOutputProductId.mockResolvedValue([
        {
          id: 1,
          isActive: true,
          outputProductId: 9,
          items: [{ ingredientProductId: 1, quantityPerOutput: '1' }],
        },
      ] as never);
      productRepo.findById.mockResolvedValue({
        id: 9,
        isActive: true,
        type: ProductType.FINISHED_GOOD,
      } as never);
      repo.generateNextProductionOrderCode.mockResolvedValue('PO-20260330-0001');
      repo.createProductionOrder.mockResolvedValue({
        id: 'po-1',
        status: 'draft',
        code: 'PO-20260330-0001',
      } as never);

      const result = await service.createOrder({
        productId: 9,
        plannedQuantity: 10,
        warehouseId: 2,
        createdBy: 'user-1',
      });

      expect(repo.findActiveRecipesByOutputProductId).toHaveBeenCalledWith(
        9,
        mockTx,
      );
      expect(repo.generateNextProductionOrderCode).toHaveBeenCalledWith(mockTx);
      expect(repo.createProductionOrder).toHaveBeenCalledWith(
        {
          code: 'PO-20260330-0001',
          recipeId: 1,
          warehouseId: 2,
          plannedQuantity: '10',
          status: 'draft',
          note: null,
          referenceId: null,
          productionType: 'standard',
          createdBy: 'user-1',
          kitchenStaffId: 'user-1',
        },
        mockTx,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'po-1', status: 'draft' }),
      );
    });

    it('should reject plannedQuantity <= 0', async () => {
      await expect(
        service.createOrder({
          productId: 1,
          plannedQuantity: 0,
          warehouseId: 1,
          createdBy: 'u',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.findActiveRecipesByOutputProductId).not.toHaveBeenCalled();
    });
  });

  describe('startProduction', () => {
    const orderId = 'order-1';

    it('should reject when plannedQuantity on order is not positive', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        plannedQuantity: '0',
        recipeId: 1,
        productionType: 'standard',
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 99,
        isActive: true,
        type: ProductType.FINISHED_GOOD,
      } as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.listAvailableInventoryFefo).not.toHaveBeenCalled();
    });

    it('Test Case 1: should fail when material stock is insufficient', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        plannedQuantity: '10',
        recipeId: 1,
        productionType: 'standard',
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 99,
        isActive: true,
        type: ProductType.FINISHED_GOOD,
      } as never);
      repo.listAvailableInventoryFefo.mockResolvedValue([
        {
          inventory: {
            id: 1,
            quantity: '5',
            reservedQuantity: '0',
          },
          batch: {
            id: 10,
            expiryDate: '2030-01-01',
            batchCode: 'B1',
          },
        },
      ] as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(
        InsufficientStockException,
      );
      expect(repo.markOrderStarted).not.toHaveBeenCalled();
    });

    it('Test Case 2: should fail when oldest FEFO batch is expired', async () => {
      repo.findOrderById.mockResolvedValue({
        id: orderId,
        status: 'draft',
        warehouseId: 1,
        plannedQuantity: '10',
        recipeId: 1,
        productionType: 'standard',
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 99,
        isActive: true,
        type: ProductType.FINISHED_GOOD,
      } as never);
      repo.listAvailableInventoryFefo.mockResolvedValue([
        {
          inventory: {
            id: 1,
            quantity: '25',
            reservedQuantity: '0',
          },
          batch: {
            id: 10,
            expiryDate: '2020-01-01',
            batchCode: 'EXP-OLD',
          },
        },
      ] as never);

      await expect(service.startProduction(orderId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.markOrderStarted).not.toHaveBeenCalled();
    });
  });

  describe('completeProduction', () => {
    const orderId = 'order-1';

    beforeEach(() => {
      repo.findRecipeWithItems.mockResolvedValue({
        id: 1,
        outputProductId: 100,
        items: [{ ingredientProductId: 1, quantityPerOutput: '1' }],
      } as never);
    });

    const baseOrderMock = {
      id: orderId,
      status: 'in_progress',
      warehouseId: 7,
      plannedQuantity: '4',
      recipeId: 1,
      productionType: 'standard',
      reservations: [
        {
          batchId: 11,
          reservedQuantity: '2.5',
          batch: { id: 11, expiryDate: '2026-12-31' },
        },
        {
          batchId: 12,
          reservedQuantity: '1.5',
          batch: { id: 12, expiryDate: '2026-11-30' },
        },
      ],
    };

    it('Test Case 3: should record production loss when actual < theoretical', async () => {
      repo.findOrderById.mockResolvedValue(baseOrderMock as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
        type: ProductType.FINISHED_GOOD,
      } as never);
      inboundRepo.insertBatch.mockResolvedValue({
        id: 200,
        batchCode: 'BAT-TP-001',
      } as never);

      const result = await service.completeProduction(orderId, {
        actualQuantity: 3.5,
        callerRole: UserRole.CENTRAL_KITCHEN_STAFF,
      });

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        7,
        200,
        'production_output',
        3.5,
        `PRODUCTION:${orderId}`,
        expect.any(String),
        mockTx,
      );

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        7,
        200,
        'waste',
        -0.5,
        `PRODUCTION:${orderId}`,
        'PRODUCTION_LOSS',
        mockTx,
      );

      expect(result.actualQuantity).toBe(3.5);
      expect(result.lossQuantity).toBe(0.5);
    });

    it('Test Case 4: should insert batch lineage for parent batches', async () => {
      repo.findOrderById.mockResolvedValue({
        ...baseOrderMock,
        reservations: [
          {
            batchId: 11,
            reservedQuantity: '2.5',
            batch: { id: 11, expiryDate: '2026-10-01' },
          },
          {
            batchId: 12,
            reservedQuantity: '1.5',
            batch: { id: 12, expiryDate: '2026-09-01' },
          },
        ],
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
        type: ProductType.FINISHED_GOOD,
      } as never);
      inboundRepo.insertBatch.mockResolvedValue({
        id: 200,
        batchCode: 'BAT-LINEAGE',
      } as never);

      await service.completeProduction(orderId, {
        actualQuantity: 4,
        callerRole: UserRole.CENTRAL_KITCHEN_STAFF,
      });

      expect(repo.insertBatchLineage).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          parentBatchId: 11,
          childBatchId: 200,
          productionOrderId: orderId,
          consumedQuantity: '2.5',
        }),
      );
      expect(repo.insertBatchLineage).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          parentBatchId: 12,
          childBatchId: 200,
          consumedQuantity: '1.5',
        }),
      );
    });

    it('Surplus Production: should save surplusNote in inventory transaction reason', async () => {
      repo.findOrderById.mockResolvedValue({
        ...baseOrderMock,
        plannedQuantity: '4',
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
        type: ProductType.FINISHED_GOOD,
      } as never);
      inboundRepo.insertBatch.mockResolvedValue({
        id: 200,
        batchCode: 'BAT-SURP',
      } as never);

      const note = 'Cân đủ thêm từ lô phụ';
      await service.completeProduction(orderId, {
        actualQuantity: 4.5,
        surplusNote: note,
        callerRole: UserRole.CENTRAL_KITCHEN_STAFF,
      });

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        7,
        200,
        'adjustment',
        0.5,
        `PRODUCTION:${orderId}`,
        `PRODUCTION_SURPLUS | ${note}`,
        mockTx,
      );
    });

    it('should reject surplus > 20% over planned for kitchen staff', async () => {
      repo.findOrderById.mockResolvedValue({
        ...baseOrderMock,
        plannedQuantity: '10',
        reservations: [
          {
            batchId: 11,
            reservedQuantity: '10',
            batch: { id: 11, expiryDate: '2026-12-31' },
          },
        ],
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
        type: ProductType.FINISHED_GOOD,
      } as never);

      await expect(
        service.completeProduction(orderId, {
          actualQuantity: 13,
          surplusNote: 'Vượt ngưỡng',
          callerRole: UserRole.CENTRAL_KITCHEN_STAFF,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow surplus > 20% over planned for manager with surplusNote', async () => {
      repo.findOrderById.mockResolvedValue({
        ...baseOrderMock,
        plannedQuantity: '10',
        reservations: [
          {
            batchId: 11,
            reservedQuantity: '10',
            batch: { id: 11, expiryDate: '2026-12-31' },
          },
        ],
      } as never);
      productRepo.findById.mockResolvedValue({
        id: 100,
        sku: 'TP-SKU',
        shelfLifeDays: 3,
        type: ProductType.FINISHED_GOOD,
      } as never);
      inboundRepo.insertBatch.mockResolvedValue({
        id: 200,
        batchCode: 'BAT-MGR',
      } as never);

      await service.completeProduction(orderId, {
        actualQuantity: 13,
        surplusNote: 'Được quản lý xác nhận',
        callerRole: UserRole.MANAGER,
      });

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        7,
        200,
        'adjustment',
        3,
        `PRODUCTION:${orderId}`,
        'PRODUCTION_SURPLUS | Được quản lý xác nhận',
        mockTx,
      );
    });

    it('should throw NotFoundException when order not found', async () => {
      repo.findOrderById.mockResolvedValue(undefined);

      await expect(
        service.completeProduction(orderId, { actualQuantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
