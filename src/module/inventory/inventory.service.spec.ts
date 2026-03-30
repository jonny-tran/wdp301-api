/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UnitOfWork } from '../../database/unit-of-work';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import {
  AgingReportQueryDto,
  WasteReportQueryDto,
} from './dto/analytics-query.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepo: jest.Mocked<InventoryRepository>;
  let mockDb: { transaction: jest.Mock };
  let mockTx: jest.Mocked<InventoryRepository>;
  let mockUow: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    const mockInventoryRepoObj = {
      getStoreInventory: jest.fn(),
      findWarehouseByStoreId: jest.fn(),
      getStoreTransactions: jest.fn(),
      upsertInventory: jest.fn(),
      createInventoryTransaction: jest.fn(),
      getInventorySummary: jest.fn(),
      getLowStockItems: jest.fn(),
      adjustBatchQuantity: jest.fn(),
      findCentralWarehouseId: jest.fn(),
      getKitchenSummary: jest.fn(),
      getKitchenBatchDetails: jest.fn(),
      getAnalyticsSummary: jest.fn(),
      getAgingReport: jest.fn(),
      getWasteReport: jest.fn(),
      getFinancialLoss: jest.fn(),
      syncBatchTotalsFromInventory: jest.fn(),
      findBatchesForFEFOWithShelfBuffer: jest.fn(),
      reserveInventoryQuantity: jest.fn(),
      findInventoryTransactionsByReferenceAndType: jest.fn(),
      listBatchesToExpire: jest.fn(),
      updateBatchStatus: jest.fn(),
      clearReservedForBatchInventory: jest.fn(),
      decreasePhysicalAndReserved: jest.fn(),
    };

    mockTx =
      mockInventoryRepoObj as unknown as jest.Mocked<InventoryRepository>;

    mockDb = {
      transaction: jest.fn(
        async (
          callback: (tx: jest.Mocked<InventoryRepository>) => Promise<unknown>,
        ) => {
          return callback(mockTx);
        },
      ),
    };

    mockUow = {
      runInTransaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: jest.fn().mockResolvedValue(undefined),
          query: {
            batches: {
              findFirst: jest.fn().mockResolvedValue({
                id: 1,
                status: 'available',
              }),
            },
            inventory: {
              findFirst: jest.fn().mockResolvedValue({
                id: 1,
                quantity: '100',
                reservedQuantity: '0',
              }),
            },
          },
        };
        return cb(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: InventoryRepository,
          useValue: mockInventoryRepoObj,
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: UnitOfWork,
          useValue: mockUow,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepo = module.get(InventoryRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adjustInventory (Logic chặn âm kho)', () => {
    it('should adjust inventory successfully if quantity >= 0', async () => {
      // Arrange
      const data = {
        warehouseId: 1,
        batchId: 2,
        adjustmentQuantity: 10,
        reason: 'Test',
        note: 'Ghi chu',
      };
      const mockResult = { quantity: '15' };
      mockTx.adjustBatchQuantity.mockResolvedValue(mockResult as never);
      mockTx.createInventoryTransaction.mockResolvedValue(true as never);

      // Act
      const result = await service.adjustInventory(data);

      // Assert
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.adjustBatchQuantity).toHaveBeenCalledWith(
        data.warehouseId,
        data.batchId,
        data.adjustmentQuantity,
        mockTx,
      );
      expect(mockTx.createInventoryTransaction).toHaveBeenCalledWith(
        data.warehouseId,
        data.batchId,
        'adjustment',
        data.adjustmentQuantity,
        undefined,
        'Test: Ghi chu',
        mockTx,
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException if quantity goes below 0', async () => {
      // Arrange
      const data = {
        warehouseId: 1,
        batchId: 2,
        adjustmentQuantity: -5,
        reason: 'Test',
      };
      mockTx.adjustBatchQuantity.mockResolvedValue({ quantity: '-5' } as never);

      // Act & Assert
      await expect(service.adjustInventory(data)).rejects.toThrow(
        new BadRequestException('Số lượng tồn kho không thể nhỏ hơn 0'),
      );
      expect(mockTx.adjustBatchQuantity).toHaveBeenCalledWith(
        data.warehouseId,
        data.batchId,
        data.adjustmentQuantity,
        mockTx,
      );
      expect(mockTx.createInventoryTransaction).not.toHaveBeenCalled();
    });
  });

  describe('updateInventory & logInventoryTransaction', () => {
    it('should call updateInventory correctly with tx', async () => {
      mockTx.upsertInventory.mockResolvedValue(true as never);

      const result = await service.updateInventory(1, 2, 5, mockTx as never);

      expect(inventoryRepo.upsertInventory).toHaveBeenCalledWith(
        1,
        2,
        5,
        mockTx,
      );
      expect(result).toBe(true);
    });

    it('should call logInventoryTransaction correctly with tx', async () => {
      mockTx.createInventoryTransaction.mockResolvedValue(true as never);

      const result = await service.logInventoryTransaction(
        1,
        2,
        'import',
        5,
        'REF-1',
        'Reason',
        mockTx as never,
      );

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        1,
        2,
        'import',
        5,
        'REF-1',
        'Reason',
        mockTx,
      );
      expect(result).toBe(true);
    });
  });

  describe('Data Isolation (getStoreInventory & getInventoryByStoreId)', () => {
    it('getStoreInventory should return correctly mapped items and meta', async () => {
      // Arrange
      const query: GetStoreInventoryDto = { page: 1, limit: 10 };
      const repoReturn = {
        items: [
          {
            id: 1,
            batchId: 2,
            batch: {
              productId: 3,
              batchCode: 'B001',
              expiryDate: '2026-06-01',
              product: {
                name: 'Gà',
                sku: 'GA01',
                baseUnit: { name: 'Cái' },
                imageUrl: 'img.png',
              },
            },
            quantity: '10',
          },
        ],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
      };
      inventoryRepo.getStoreInventory.mockResolvedValue(repoReturn as never);

      // Act
      const result = await service.getStoreInventory(100, query);

      // Assert
      expect(inventoryRepo.getStoreInventory).toHaveBeenCalledWith(100, query);
      expect(result.items.length).toBe(1);
      expect(result.items[0]).toEqual({
        inventoryId: 1,
        batchId: 2,
        productId: 3,
        productName: 'Gà',
        sku: 'GA01',
        batchCode: 'B001',
        quantity: 10,
        expiryDate: new Date('2026-06-01'),
        unit: 'Cái',
        imageUrl: 'img.png',
      });
      expect(result.meta).toEqual(repoReturn.meta);
    });

    it('getInventoryByStoreId should find warehouse and call getStoreInventory', async () => {
      // Arrange
      inventoryRepo.findWarehouseByStoreId.mockResolvedValue({
        id: 100,
      } as never);
      inventoryRepo.getStoreInventory.mockResolvedValue({
        items: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: 10,
          totalPages: 0,
          currentPage: 1,
        },
      } as never);
      const query = { page: 1 };

      // Act
      await service.getInventoryByStoreId(
        'store-1',
        query as GetStoreInventoryDto,
      );

      // Assert
      expect(inventoryRepo.findWarehouseByStoreId).toHaveBeenCalledWith(
        'store-1',
      );
      expect(inventoryRepo.getStoreInventory).toHaveBeenCalledWith(100, query);
    });

    it('getInventoryByStoreId should throw NotFoundException if warehouse not found', async () => {
      inventoryRepo.findWarehouseByStoreId.mockResolvedValue(null as never);
      await expect(service.getInventoryByStoreId('store-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getInventoryByStoreId('store-1')).rejects.toThrow(
        'Không tìm thấy kho cho cửa hàng này',
      );
    });
  });

  describe('Analytics & Summaries', () => {
    describe('getKitchenSummary', () => {
      it('should return empty if central warehouse not found', async () => {
        inventoryRepo.findCentralWarehouseId.mockResolvedValue(null as never);
        const result = await service.getKitchenSummary({
          limit: 10,
          page: 2,
        } as GetKitchenInventoryDto);
        expect(result.items.length).toBe(0);
        expect(result.meta.currentPage).toBe(2);
      });

      it('should map items and filters correctly if central warehouse exists', async () => {
        inventoryRepo.findCentralWarehouseId.mockResolvedValue(55 as never);
        const repoFormat = {
          items: [
            {
              productId: 1,
              productName: 'Cam',
              sku: 'CAM',
              unitName: 'Kg',
              minStock: 20,
              totalPhysical: 15,
              totalReserved: 5,
            },
          ],
          meta: {
            totalItems: 1,
            itemCount: 1,
            itemsPerPage: 10,
            totalPages: 1,
            currentPage: 2,
          },
        };
        inventoryRepo.getKitchenSummary.mockResolvedValue(repoFormat as never);

        const result = await service.getKitchenSummary({
          search: 'M',
          limit: 10,
          page: 2,
        } as GetKitchenInventoryDto);

        expect(inventoryRepo.getKitchenSummary).toHaveBeenCalledWith(55, {
          search: 'M',
          limit: 10,
          offset: 10,
        });
        expect(result.items.length).toBe(1);
        expect(result.items[0].availableQuantity).toBe(10);
        expect(result.items[0].isLowStock).toBe(true);
        expect(result.meta).toEqual(repoFormat.meta);
      });
    });

    describe('getAgingReport', () => {
      it('should correctly bucket report items', async () => {
        inventoryRepo.findCentralWarehouseId.mockResolvedValue(1 as never);
        inventoryRepo.getAgingReport.mockResolvedValue([
          {
            batchCode: 'B1',
            productName: 'A',
            quantity: '10',
            expiryDate: new Date(Date.now() + 10 * 86400000).toISOString(),
            shelfLifeDays: 20,
          },
          {
            batchCode: 'B2',
            productName: 'B',
            quantity: '20',
            expiryDate: new Date(Date.now() + 6 * 86400000).toISOString(),
            shelfLifeDays: 20,
          },
          {
            batchCode: 'B3',
            productName: 'C',
            quantity: '30',
            expiryDate: new Date(Date.now() + 2 * 86400000).toISOString(),
            shelfLifeDays: 20,
          },
        ] as never);

        const result = await service.getAgingReport({
          daysThreshold: 5,
        } as AgingReportQueryDto);

        expect(inventoryRepo.getAgingReport).toHaveBeenCalledWith(1);
        expect(result.summary.appliedThreshold).toBe(5);
        expect(result.buckets.fresh.length).toBe(0);
        expect(result.buckets.warning.length).toBe(2);
        expect(result.buckets.critical.length).toBe(1);
      });
    });

    describe('getWasteReport', () => {
      it('should sum wasted quantity efficiently and match layout', async () => {
        inventoryRepo.findCentralWarehouseId.mockResolvedValue(1 as never);
        inventoryRepo.getWasteReport.mockResolvedValue([
          {
            transactionId: 1,
            productName: 'A',
            batchCode: 'B',
            quantityWasted: '-50',
            reason: 'Hư',
            createdAt: new Date(),
          },
          {
            transactionId: 2,
            productName: 'B',
            batchCode: 'C',
            quantityWasted: '-30',
            reason: 'Rot',
            createdAt: new Date(),
          },
        ] as never);

        const result = await service.getWasteReport({
          fromDate: '2026-01-01',
          toDate: '2026-06-01',
        } as WasteReportQueryDto);

        expect(inventoryRepo.getWasteReport).toHaveBeenCalledWith(
          1,
          '2026-01-01',
          '2026-06-01',
        );
        expect(result.kpi.totalWastedQuantity).toBe(80);
        expect(result.details.length).toBe(2);
      });
    });

    describe('getFinancialLoss', () => {
      it('should calculate estimated loss matching schema design', async () => {
        inventoryRepo.getFinancialLoss.mockResolvedValue({
          wasteData: [
            { productId: 1, productName: 'Product A', totalWaste: 10 },
          ],
          claimData: [
            { productId: 1, productName: 'Product A', totalDamaged: 5 },
          ],
        } as never);

        const result = await service.getFinancialLoss({
          from: '2026-01-01',
          to: '2026-06-01',
        });

        expect(inventoryRepo.getFinancialLoss).toHaveBeenCalledWith(
          '2026-01-01',
          '2026-06-01',
        );
        // 10 + 5 = 15. price = 50000. 15 * 50000 = 750000
        expect(result.kpi.totalEstimatedLossVnd).toBe(750000);
        expect(result.details.length).toBe(1);
        expect(result.details[0].totalLossQty).toBe(15);
      });
    });
  });

  describe('Core Business Rules (KFC Model SP26SWP07)', () => {
    it('1. Test FEFO (First Expired, First Out) - suggestBatchesForPicking', async () => {
      // Kịch bản: Tạo 3 lô hàng giả lập
      // Lô A: Hết hạn tháng 5/2026
      // Lô B: Hết hạn tháng 3/2026
      // Lô C: Hết hạn tháng 3/2026 nhưng nhập kho sau lô B (repo trả về B trước C do ASC)
      const mockBatches = [
        {
          batchId: 2,
          batchCode: 'Lô B',
          expiryDate: '2026-03-01',
          quantity: '100',
          reserved: '0',
        },
        {
          batchId: 3,
          batchCode: 'Lô C',
          expiryDate: '2026-03-01',
          quantity: '50',
          reserved: '0',
        },
        {
          batchId: 1,
          batchCode: 'Lô A',
          expiryDate: '2026-05-01',
          quantity: '200',
          reserved: '0',
        },
      ];
      inventoryRepo.getKitchenBatchDetails.mockResolvedValue(
        mockBatches as never,
      );

      // Cần lấy 120 sản phẩm
      const result = await service.suggestBatchesForPicking(1, 99, 120);

      expect(inventoryRepo.getKitchenBatchDetails).toHaveBeenCalledWith(1, 99);
      // Kỳ vọng: Hệ thống phải trả về thứ tự: Lô B (100) -> Lô C (20) -> dừng
      expect(result.pickedBatches[0].batchCode).toBe('Lô B');
      expect(result.pickedBatches[0].pickedQuantity).toBe(100);
      expect(result.pickedBatches[1].batchCode).toBe('Lô C');
      expect(result.pickedBatches[1].pickedQuantity).toBe(20);
      expect(result.pickedBatches.length).toBe(2);
      expect(result.fulfilledQuantity).toBe(120);
    });

    it('2. Test Batch-Centric & Data Integrity - adjustInventory', async () => {
      // Kịch bản: Truyền một batch_id không tồn tại trong warehouse_id mục tiêu
      const data = {
        warehouseId: 99,
        batchId: 999, // Không tồn tại
        adjustmentQuantity: -10,
        reason: 'Lỗi',
      };

      // Mock DB ném NotFoundException nếu logic được throw, hoặc Drizzle throw
      mockTx.adjustBatchQuantity.mockRejectedValue(
        new NotFoundException('Batch not found in warehouse'),
      );

      // Kỳ vọng: Quăng lỗi NotFoundException, tuyệt đối không được trừ âm
      await expect(service.adjustInventory(data)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockTx.createInventoryTransaction).not.toHaveBeenCalled();
    });

    it('3. Test No Backorders & Partial Fulfillment - suggestBatchesForPicking', async () => {
      // Kịch bản: Đơn hàng yêu cầu 100 sản phẩm. Tổng các lô trong kho chỉ có 70.
      const mockBatches = [
        {
          batchId: 1,
          batchCode: 'B1',
          expiryDate: '2026-01-01',
          quantity: '70',
          reserved: '0',
        },
      ];
      inventoryRepo.getKitchenBatchDetails.mockResolvedValue(
        mockBatches as never,
      );

      // Yêu cầu 100
      const result = await service.suggestBatchesForPicking(1, 1, 100);

      // Kỳ vọng: Chỉ xuất số lượng hiện có (70) và KHÔNG nợ
      expect(result.fulfilledQuantity).toBe(70);
      expect(result.pickedBatches.length).toBe(1);
      expect(result.pickedBatches[0].pickedQuantity).toBe(70);
      // Kho không đủ hàng, hủy phần còn lại (30 không được fulfilled, không bị backorder)
    });

    it('4. Test Discrepancy (Sai lệch khi nhận hàng) - receiveDiscrepancy', async () => {
      // Kịch bản: Bếp xuất đi 10. Store kiểm thấy hỏng 2, chỉ nhận 8.
      mockTx.upsertInventory.mockResolvedValue(true as never);
      mockTx.createInventoryTransaction.mockResolvedValue(true as never);

      const receivedQty = 8;
      const shippedQty = 10; // Không dùng trong logic update kho, chỉ dùng để check chênh lệch (tạo Claim) ở Shipment Flow

      const result = await service.receiveDiscrepancy(
        2,
        5,
        shippedQty,
        receivedQty,
        'Store Delivery',
        mockTx as never,
      );

      // Kỳ vọng: Gọi hàm cập nhật kho Store với số lượng thực nhận = 8
      expect(inventoryRepo.upsertInventory).toHaveBeenCalledWith(
        2,
        5,
        8,
        mockTx,
      );

      // InventoryTransaction ghi nhận loại giao dịch 'import' (do schema không có store_receipt, ta quy ước là import store_receipt reason)
      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        2,
        5,
        'import',
        8,
        undefined,
        'Store Delivery',
        mockTx,
      );

      expect(result.receivedQty).toBe(8);
    });
  });

  describe('Inventory Engine (audit / FEFO / atomicity)', () => {
    it('should not sync batch when audit insert fails (atomicity)', async () => {
      inventoryRepo.adjustBatchQuantity.mockResolvedValue({ quantity: '95' } as never);
      inventoryRepo.createInventoryTransaction.mockRejectedValue(
        new Error('simulated insert failure'),
      );
      inventoryRepo.syncBatchTotalsFromInventory.mockResolvedValue(undefined);

      await expect(
        service.adjustStock({
          warehouseId: 1,
          batchId: 1,
          quantityDelta: -5,
          reason: 'Test',
        }),
      ).rejects.toThrow('simulated insert failure');

      expect(inventoryRepo.syncBatchTotalsFromInventory).not.toHaveBeenCalled();
    });

    it('should not allocate when FEFO+buffer returns no eligible batches', async () => {
      inventoryRepo.findBatchesForFEFOWithShelfBuffer.mockResolvedValue([]);

      const result = await service.lockStockForOrder(
        'order-1',
        1,
        [{ orderItemId: 1, productId: 1, quantityRequested: 50 }],
        mockTx as never,
      );

      expect(result.results[0].approved).toBe(0);
      expect(result.results[0].missing).toBe(50);
      expect(inventoryRepo.reserveInventoryQuantity).not.toHaveBeenCalled();
    });

    it('should create exactly one adjust_loss transaction with correct sign', async () => {
      inventoryRepo.adjustBatchQuantity.mockResolvedValue({ quantity: '90' } as never);
      inventoryRepo.createInventoryTransaction.mockResolvedValue({ id: 1 } as never);
      inventoryRepo.syncBatchTotalsFromInventory.mockResolvedValue(undefined);

      await service.adjustStock({
        warehouseId: 1,
        batchId: 1,
        quantityDelta: -10,
        reason: 'Lý do',
        evidenceImage: 'https://example.com/evidence.png',
      });

      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledTimes(1);
      expect(inventoryRepo.createInventoryTransaction).toHaveBeenCalledWith(
        1,
        1,
        'adjust_loss',
        -10,
        undefined,
        'Lý do',
        expect.anything(),
        expect.objectContaining({
          evidenceImage: 'https://example.com/evidence.png',
        }),
      );
    });
  });
});
