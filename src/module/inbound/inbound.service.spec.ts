import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { ProductService } from '../product/product.service';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';

describe('InboundService', () => {
  let service: InboundService;
  let inboundRepo: jest.Mocked<Partial<InboundRepository>>;
  let warehouseRepo: jest.Mocked<Partial<WarehouseRepository>>;
  let productService: jest.Mocked<Partial<ProductService>>;

  beforeEach(async () => {
    inboundRepo = {
      createReceipt: jest.fn(),
      findReceiptWithLock: jest.fn(),
      getReceiptItemsWithBatches: jest.fn(),
      updateReceiptStatus: jest.fn(),
      updateBatchStatus: jest.fn(),
      upsertInventory: jest.fn(),
      insertInventoryTransaction: jest.fn(),
      findReceiptById: jest.fn(),
      getProductDetails: jest.fn(),
      addReceiptItem: jest.fn(),
      getBatchDetails: jest.fn(),
      findReceiptItemByBatchId: jest.fn(),
      deleteBatchAndItem: jest.fn(),
      findAllReceipts: jest.fn(),
      findReceiptDetail: jest.fn(),
    };

    warehouseRepo = {
      findCentralWarehouseId: jest.fn(),
    };

    productService = {
      createBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundService,
        { provide: InboundRepository, useValue: inboundRepo },
        { provide: WarehouseRepository, useValue: warehouseRepo },
        { provide: ProductService, useValue: productService },
        {
          provide: DATABASE_CONNECTION,
          useValue: { transaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InboundService>(InboundService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addReceiptItem', () => {
    it('should test Batch creation successfully (Quản lý theo Batch)', async () => {
      // Arrange
      const receiptId = 'receipt-1';
      const dto: AddReceiptItemDto = { productId: 1, quantity: 100 };

      (inboundRepo.findReceiptById as jest.Mock).mockResolvedValue({
        id: 'receipt-1',
        status: 'draft',
      });
      (inboundRepo.getProductDetails as jest.Mock).mockResolvedValue({
        id: 1,
        shelfLifeDays: 30,
      });
      (productService.createBatch as jest.Mock).mockResolvedValue({
        id: 10,
        batchCode: 'BATCH123',
        expiryDate: new Date('2026-10-10'),
      });
      (inboundRepo.addReceiptItem as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.addReceiptItem(receiptId, dto);

      // Assert
      expect(inboundRepo.findReceiptById).toHaveBeenCalledWith(receiptId);
      expect(productService.createBatch).toHaveBeenCalledWith(1);
      expect(inboundRepo.addReceiptItem).toHaveBeenCalledWith(
        receiptId,
        10,
        100,
      );
      expect(result).toHaveProperty('batchId', 10);
      expect(result).toHaveProperty('batchCode', 'BATCH123');
    });

    it('should throw BadRequestException if product has no shelf life (Khoảng thời hạn)', async () => {
      // Arrange
      const receiptId = 'receipt-1';
      const dto: AddReceiptItemDto = { productId: 1, quantity: 100 };

      (inboundRepo.findReceiptById as jest.Mock).mockResolvedValue({
        id: 'receipt-1',
        status: 'draft',
      });
      (inboundRepo.getProductDetails as jest.Mock).mockResolvedValue({
        id: 1,
        shelfLifeDays: null, // this will trigger the error
      });

      // Act & Assert
      await expect(service.addReceiptItem(receiptId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addReceiptItem(receiptId, dto)).rejects.toThrow(
        'Sản phẩm chưa được cấu hình hạn sử dụng (Shelf Life)',
      );
    });
  });
});
