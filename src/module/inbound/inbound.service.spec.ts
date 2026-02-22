/* eslint-disable @typescript-eslint/unbound-method */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { RequestWithUser } from '../auth/types/auth.types';
import { ProductService } from '../product/product.service';
import { WarehouseRepository } from './../warehouse/warehouse.repository';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { GetReceiptsDto } from './dto/get-receipts.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import * as inboundUtils from './helpers/inbound.util';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';

jest.mock('./helpers/inbound.util', () => ({
  generateQrData: jest.fn(),
}));

describe('InboundService', () => {
  let service: InboundService;
  let inboundRepo: jest.Mocked<InboundRepository>;
  let productService: jest.Mocked<ProductService>;
  let mockDb: { transaction: jest.Mock };
  let mockTx: jest.Mocked<InboundRepository>;

  beforeEach(async () => {
    const mockInboundRepoObj = {
      findReceiptById: jest.fn(),
      getProductDetails: jest.fn(),
      addReceiptItem: jest.fn(),
      findReceiptWithLock: jest.fn(),
      getReceiptItemsWithBatches: jest.fn(),
      updateReceiptStatus: jest.fn(),
      updateBatchStatus: jest.fn(),
      upsertInventory: jest.fn(),
      insertInventoryTransaction: jest.fn(),
      findReceiptItemByBatchId: jest.fn(),
      deleteBatchAndItem: jest.fn(),
      findAllReceipts: jest.fn(),
      getBatchDetails: jest.fn(),
      createReceipt: jest.fn(),
      findReceiptDetail: jest.fn(),
    };

    mockTx = mockInboundRepoObj as unknown as jest.Mocked<InboundRepository>;

    mockDb = {
      transaction: jest.fn(
        async (
          callback: (tx: jest.Mocked<InboundRepository>) => Promise<unknown>,
        ) => {
          return callback(mockTx);
        },
      ),
    };

    const mockProductServiceObj = {
      createBatch: jest.fn(),
    };

    const mockWarehouseRepoObj = {
      findCentralWarehouseId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundService,
        {
          provide: InboundRepository,
          useValue: mockInboundRepoObj,
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: ProductService,
          useValue: mockProductServiceObj,
        },
        {
          provide: WarehouseRepository,
          useValue: mockWarehouseRepoObj,
        },
      ],
    }).compile();

    service = module.get<InboundService>(InboundService);
    inboundRepo = module.get(InboundRepository);
    productService = module.get(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addReceiptItem (Luồng sinh Batch)', () => {
    it('should successfully add an item and return a warning if shelfLifeDays < 2', async () => {
      // Arrange
      const receiptId = 'receipt-1';
      const dto: AddReceiptItemDto = { productId: 1, quantity: 10 };

      inboundRepo.findReceiptById.mockResolvedValue({
        status: 'draft',
      } as never);
      inboundRepo.getProductDetails.mockResolvedValue({
        shelfLifeDays: 1,
      } as never); // Warning condition
      productService.createBatch.mockResolvedValue({
        id: 100,
        batchCode: 'B-100',
        expiryDate: '2026-01-01',
      } as never);
      inboundRepo.addReceiptItem.mockResolvedValue(true as never);

      // Act
      const result = await service.addReceiptItem(receiptId, dto);

      // Assert
      expect(inboundRepo.findReceiptById).toHaveBeenCalledWith(receiptId);
      expect(inboundRepo.getProductDetails).toHaveBeenCalledWith(dto.productId);
      expect(productService.createBatch).toHaveBeenCalledWith(dto.productId);
      expect(inboundRepo.addReceiptItem).toHaveBeenCalledWith(
        receiptId,
        100,
        10,
      );
      expect(result.warning).toBe(
        'Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)',
      );
    });

    it('should throw NotFoundException if receipt does not exist', async () => {
      inboundRepo.findReceiptById.mockResolvedValue(null as never);
      await expect(
        service.addReceiptItem('1', { productId: 1, quantity: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if receipt is not draft', async () => {
      inboundRepo.findReceiptById.mockResolvedValue({
        status: 'completed',
      } as never);
      await expect(
        service.addReceiptItem('1', { productId: 1, quantity: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if product has no shelfLifeDays', async () => {
      inboundRepo.findReceiptById.mockResolvedValue({
        status: 'draft',
      } as never);
      inboundRepo.getProductDetails.mockResolvedValue({
        shelfLifeDays: null,
      } as never);
      await expect(
        service.addReceiptItem('1', { productId: 1, quantity: 10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeReceipt (Luồng Transaction chốt phiếu)', () => {
    it('should complete receipt and perform transactions successfully', async () => {
      const receiptId = 'r-1';
      mockTx.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
      } as never);
      mockTx.getReceiptItemsWithBatches.mockResolvedValue([
        { batchId: 10, quantity: '5' },
      ] as never);
      mockTx.updateReceiptStatus.mockResolvedValue(true as never);
      mockTx.updateBatchStatus.mockResolvedValue(true as never);
      mockTx.upsertInventory.mockResolvedValue(true as never);
      mockTx.insertInventoryTransaction.mockResolvedValue(true as never);

      const result = await service.completeReceipt(receiptId);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.findReceiptWithLock).toHaveBeenCalledWith(
        mockTx,
        receiptId,
      );
      expect(mockTx.updateReceiptStatus).toHaveBeenCalledWith(
        mockTx,
        receiptId,
        'completed',
      );
      expect(mockTx.updateBatchStatus).toHaveBeenCalledWith(
        mockTx,
        10,
        'available',
      );
      expect(mockTx.upsertInventory).toHaveBeenCalledWith(mockTx, 1, 10, '5');
      expect(result).toEqual({ message: 'Success' });
    });

    it('should throw NotFoundException if receipt not found', async () => {
      mockTx.findReceiptWithLock.mockResolvedValue(null as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if receipt is not draft', async () => {
      mockTx.findReceiptWithLock.mockResolvedValue({
        status: 'completed',
      } as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if receipt has no items', async () => {
      mockTx.findReceiptWithLock.mockResolvedValue({
        status: 'draft',
      } as never);
      mockTx.getReceiptItemsWithBatches.mockResolvedValue([] as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        'Không thể hoàn thành phiếu nhập rỗng (chưa có hàng hóa)',
      );
    });
  });

  describe('deleteBatchItem (Bảo vệ dữ liệu)', () => {
    it('should throw BadRequestException if receipt is not draft', async () => {
      inboundRepo.findReceiptItemByBatchId.mockResolvedValue({
        id: 1,
        receipt: { status: 'completed' },
      } as never);

      await expect(service.deleteBatchItem(10)).rejects.toThrow(
        'Chỉ có thể xóa hàng hóa trong phiếu nhập nháp',
      );
    });

    it('should successfully delete if receipt is draft', async () => {
      inboundRepo.findReceiptItemByBatchId.mockResolvedValue({
        id: 1,
        receipt: { status: 'draft' },
      } as never);
      inboundRepo.deleteBatchAndItem.mockResolvedValue(true as never);

      const result = await service.deleteBatchItem(10);
      expect(inboundRepo.deleteBatchAndItem).toHaveBeenCalledWith(10, 1);
      expect(result).toEqual({ message: 'Success' });
    });
  });

  describe('getAllReceipts (Tính nhất quán của Meta Data)', () => {
    it('should return paginated data correctly formatted', async () => {
      const mockResult = {
        items: [{ id: '1', status: 'completed' }],
        meta: {
          currentPage: 1,
          itemsPerPage: 10,
          itemCount: 1,
          totalPages: 1,
          totalItems: 1,
        },
      };
      inboundRepo.findAllReceipts.mockResolvedValue(mockResult as never);

      const result = await service.getAllReceipts({
        page: 1,
        limit: 10,
      } as GetReceiptsDto);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('meta');
      expect(result.items).toEqual(mockResult.items);
    });
  });

  describe('reprintBatchLabel (Audit Log)', () => {
    it('should generate QR code and verify audit behavior', async () => {
      const dto: ReprintBatchDto = { batchId: 1 };
      const user = { userId: 'u-1' } as RequestWithUser['user'];
      const mockBatch = {
        batchCode: 'B-1',
        sku: 'SKU-1',
        expiryDate: '2026-01-01',
      };

      inboundRepo.getBatchDetails.mockResolvedValue(mockBatch as never);
      jest
        .spyOn(inboundUtils, 'generateQrData')
        .mockReturnValue('QR_MOCK_DATA');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.reprintBatchLabel(dto, user);

      expect(inboundUtils.generateQrData).toHaveBeenCalledWith(mockBatch);
      expect(consoleSpy).toHaveBeenCalled();
      expect(result.qrData).toBe('QR_MOCK_DATA');

      consoleSpy.mockRestore();
    });

    it('should throw NotFoundException if batch not found', async () => {
      inboundRepo.getBatchDetails.mockResolvedValue(null as never);
      await expect(
        service.reprintBatchLabel({ batchId: 1 }, {
          userId: '1',
        } as RequestWithUser['user']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
