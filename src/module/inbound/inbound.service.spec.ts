/* eslint-disable @typescript-eslint/unbound-method */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { UnitOfWork } from '../../database/unit-of-work';
import { RequestWithUser } from '../auth/types/auth.types';
import { SystemConfigService } from '../system-config/system-config.service';
import { WarehouseRepository } from './../warehouse/warehouse.repository';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { GetReceiptsDto } from './dto/get-receipts.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import * as inboundUtils from './helpers/inbound.util';
import { ReceiptStatus } from './constants/receipt-status.enum';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';
import * as vnTime from '../../common/time/vn-time';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

jest.mock('./helpers/inbound.util', () => ({
  generateQrData: jest.fn(),
}));

describe('InboundService', () => {
  let service: InboundService;
  let inboundRepo: jest.Mocked<InboundRepository>;
  let mockDb: { transaction: jest.Mock };
  let mockTx: unknown;
  let systemConfig: { getConfigValue: jest.Mock };

  beforeEach(async () => {
    mockTx = {};

    const mockInboundRepoObj = {
      findReceiptById: jest.fn(),
      getProductDetails: jest.fn(),
      addReceiptItemLine: jest.fn(),
      findReceiptWithLock: jest.fn(),
      getReceiptItemsWithBatches: jest.fn(),
      getReceiptItemsWithBatchesTx: jest.fn(),
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
      findReceiptItemById: jest.fn(),
      deleteReceiptLine: jest.fn(),
      deleteReceipt: jest.fn(),
      insertBatch: jest.fn(),
      updateReceiptItemBatchLink: jest.fn(),
      lockWarehouseStock: jest.fn(),
      approveVariance: jest.fn(),
      lockBatchCodeGeneration: jest.fn(),
      isBatchCodeTaken: jest.fn().mockResolvedValue(false),
    };

    mockDb = {
      transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback(mockTx);
        },
      ),
    };

    const mockUow = {
      runInTransaction: jest.fn(
        async <T>(work: (tx: unknown) => Promise<T>) => {
          return work(mockTx);
        },
      ),
    };

    systemConfig = {
      getConfigValue: jest.fn().mockResolvedValue('3'),
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
          provide: WarehouseRepository,
          useValue: mockWarehouseRepoObj,
        },
        { provide: UnitOfWork, useValue: mockUow },
        { provide: SystemConfigService, useValue: systemConfig },
      ],
    }).compile();

    service = module.get<InboundService>(InboundService);
    inboundRepo = module.get(InboundRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addReceiptItem', () => {
    it('should add a draft line and warn if shelfLifeDays < 2', async () => {
      const receiptId = 'receipt-1';
      const dto: AddReceiptItemDto = {
        productId: 1,
        quantityAccepted: 10,
        quantityRejected: 0,
        manufacturedDate: '2026-03-20',
      };

      inboundRepo.findReceiptById.mockResolvedValue({
        status: 'draft',
      } as never);
      inboundRepo.getProductDetails.mockResolvedValue({
        shelfLifeDays: 1,
        sku: 'CK',
      } as never);
      inboundRepo.addReceiptItemLine.mockResolvedValue({ id: 99 } as never);

      const result = await service.addReceiptItem(receiptId, dto);

      expect(inboundRepo.addReceiptItemLine).toHaveBeenCalled();
      expect(result.warning).toBe(
        'Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)',
      );
      expect(result.receiptItemId).toBe(99);
    });

    it('should throw NotFoundException if receipt does not exist', async () => {
      inboundRepo.findReceiptById.mockResolvedValue(null as never);
      await expect(
        service.addReceiptItem('1', {
          productId: 1,
          quantityAccepted: 10,
          manufacturedDate: '2026-03-20',
        } as AddReceiptItemDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if receipt is not draft', async () => {
      inboundRepo.findReceiptById.mockResolvedValue({
        status: 'completed',
      } as never);
      await expect(
        service.addReceiptItem('1', {
          productId: 1,
          quantityAccepted: 10,
          manufacturedDate: '2026-03-20',
        } as AddReceiptItemDto),
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
        service.addReceiptItem('1', {
          productId: 1,
          quantityAccepted: 10,
          manufacturedDate: '2026-03-20',
        } as AddReceiptItemDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeReceipt', () => {
    it('should complete legacy line with batch (batchId set)', async () => {
      const receiptId = 'r-1';
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 1,
          batchId: 10,
          quantity: '5',
          quantityAccepted: '5',
          quantityRejected: '0',
          storageLocationCode: null,
        },
      ] as never);
      inboundRepo.updateReceiptStatus.mockResolvedValue(true as never);
      inboundRepo.updateBatchStatus.mockResolvedValue(true as never);
      inboundRepo.upsertInventory.mockResolvedValue(true as never);
      inboundRepo.insertInventoryTransaction.mockResolvedValue(true as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);

      const result = await service.completeReceipt(receiptId);

      expect(inboundRepo.findReceiptWithLock).toHaveBeenCalled();
      expect(inboundRepo.updateBatchStatus).toHaveBeenCalledWith(
        mockTx,
        10,
        'available',
      );
      expect(inboundRepo.upsertInventory).toHaveBeenCalledWith(mockTx, 1, 10, '5');
      expect(result).toEqual({ message: 'Success' });
    });

    it('should throw NotFoundException if receipt not found', async () => {
      inboundRepo.findReceiptWithLock.mockResolvedValue(null as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if receipt is not draft', async () => {
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        status: 'completed',
      } as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if receipt has no items', async () => {
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        status: 'draft',
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);
      await expect(service.completeReceipt('1')).rejects.toThrow(
        'Không thể hoàn thành phiếu nhập rỗng (chưa có hàng hóa)',
      );
    });

    it('should throw BadRequestException when received qty exceeds variance threshold without approval', async () => {
      const receiptId = 'r-var';
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      systemConfig.getConfigValue.mockResolvedValue('3');
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 10,
          batchId: null,
          quantityAccepted: '100',
          quantityRejected: '5',
          expectedQuantity: '100',
          storageLocationCode: 'LOC-1',
          manufacturedDate: '2026-03-01',
          statedExpiryDate: null,
          product: { id: 1, sku: 'SKU1', shelfLifeDays: 5 },
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);

      await expect(service.completeReceipt(receiptId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.completeReceipt(receiptId)).rejects.toThrow(
        /Nhập vượt ngưỡng sai số \(3%\)/,
      );
    });

    it('should complete new line when over threshold but variance already approved', async () => {
      const receiptId = 'r-ok';
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: 'manager-uuid',
      } as never);
      systemConfig.getConfigValue.mockResolvedValue('3');
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 11,
          batchId: null,
          quantityAccepted: '100',
          quantityRejected: '10',
          expectedQuantity: '100',
          storageLocationCode: 'LOC-2',
          manufacturedDate: '2026-03-01',
          statedExpiryDate: null,
          product: { id: 2, sku: 'EGGX', shelfLifeDays: 3 },
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);
      inboundRepo.insertBatch.mockResolvedValue({ id: 501 } as never);
      inboundRepo.updateReceiptItemBatchLink.mockResolvedValue(undefined as never);
      inboundRepo.updateReceiptStatus.mockResolvedValue(undefined as never);
      inboundRepo.updateBatchStatus.mockResolvedValue(undefined as never);
      inboundRepo.upsertInventory.mockResolvedValue(undefined as never);
      inboundRepo.insertInventoryTransaction.mockResolvedValue(undefined as never);

      await expect(service.completeReceipt(receiptId)).resolves.toEqual({
        message: 'Success',
      });
      expect(inboundRepo.insertBatch).toHaveBeenCalled();
    });

    it('should use statedExpiryDate when splitting lots with different expiry (not NSX + shelfLife)', async () => {
      const receiptId = 'r-split';
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 2,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 20,
          batchId: null,
          quantityAccepted: '400',
          quantityRejected: '0',
          expectedQuantity: null,
          storageLocationCode: 'RACK-9',
          manufacturedDate: '2026-03-10',
          statedExpiryDate: '2026-03-20',
          product: { id: 3, sku: 'TRUNG', shelfLifeDays: 14 },
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);
      inboundRepo.insertBatch.mockResolvedValue({ id: 600 } as never);
      inboundRepo.updateReceiptItemBatchLink.mockResolvedValue(undefined as never);
      inboundRepo.updateReceiptStatus.mockResolvedValue(undefined as never);
      inboundRepo.updateBatchStatus.mockResolvedValue(undefined as never);
      inboundRepo.upsertInventory.mockResolvedValue(undefined as never);
      inboundRepo.insertInventoryTransaction.mockResolvedValue(undefined as never);

      await service.completeReceipt(receiptId);

      expect(inboundRepo.insertBatch).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          expiryDate: '2026-03-20',
          manufacturedDate: '2026-03-10',
        }),
      );
    });

    it('should calculate expiry as receivingDate + shelfLifeDays when statedExpiryDate omitted', async () => {
      const receiptId = 'r-calc';
      const nowSpy = jest
        .spyOn(vnTime, 'nowVn')
        .mockReturnValue(dayjs.tz('2026-03-15', vnTime.VN_TZ));
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 21,
          batchId: null,
          quantityAccepted: '10',
          quantityRejected: '0',
          expectedQuantity: null,
          storageLocationCode: 'A',
          manufacturedDate: '2026-03-10',
          statedExpiryDate: null,
          product: { id: 4, sku: 'MEAT', shelfLifeDays: 2 },
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);
      inboundRepo.insertBatch.mockResolvedValue({ id: 700 } as never);
      inboundRepo.updateReceiptItemBatchLink.mockResolvedValue(undefined as never);
      inboundRepo.updateReceiptStatus.mockResolvedValue(undefined as never);
      inboundRepo.updateBatchStatus.mockResolvedValue(undefined as never);
      inboundRepo.upsertInventory.mockResolvedValue(undefined as never);
      inboundRepo.insertInventoryTransaction.mockResolvedValue(undefined as never);

      await service.completeReceipt(receiptId);

      expect(inboundRepo.insertBatch).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          manufacturedDate: '2026-03-10',
          expiryDate: '2026-03-17',
        }),
      );
      nowSpy.mockRestore();
    });

    it('should call lockWarehouseStock (pg_advisory) before updateReceiptStatus and before inventory writes', async () => {
      const receiptId = 'r-lock';
      const callOrder: string[] = [];
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 99,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 1,
          batchId: 10,
          quantity: '1',
          quantityAccepted: '1',
          quantityRejected: '0',
          storageLocationCode: null,
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockImplementation(async () => {
        callOrder.push('lockWarehouseStock');
      });
      inboundRepo.updateReceiptStatus.mockImplementation(async () => {
        callOrder.push('updateReceiptStatus');
      });
      inboundRepo.updateBatchStatus.mockImplementation(async () => {
        callOrder.push('updateBatchStatus');
      });
      inboundRepo.upsertInventory.mockImplementation(async () => {
        callOrder.push('upsertInventory');
      });
      inboundRepo.insertInventoryTransaction.mockImplementation(async () => {
        callOrder.push('insertInventoryTransaction');
      });

      await service.completeReceipt(receiptId);

      expect(callOrder[0]).toBe('lockWarehouseStock');
      expect(callOrder[1]).toBe('updateReceiptStatus');
      expect(callOrder).toContain('upsertInventory');
      expect(inboundRepo.lockWarehouseStock).toHaveBeenCalledWith(mockTx, 99);
    });

    it('should call lockBatchCodeGeneration and isBatchCodeTaken before insertBatch for new lines', async () => {
      const receiptId = 'r-seq';
      const seq: string[] = [];
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        warehouseId: 1,
        status: 'draft',
        id: receiptId,
        varianceApprovedBy: null,
      } as never);
      inboundRepo.getReceiptItemsWithBatchesTx.mockResolvedValue([
        {
          id: 30,
          batchId: null,
          quantityAccepted: '5',
          quantityRejected: '0',
          expectedQuantity: null,
          storageLocationCode: 'Z',
          manufacturedDate: '2026-04-01',
          statedExpiryDate: null,
          product: { id: 1, sku: 'S1', shelfLifeDays: 1 },
        },
      ] as never);
      inboundRepo.lockWarehouseStock.mockResolvedValue(undefined as never);
      inboundRepo.lockBatchCodeGeneration.mockImplementation(async () => {
        seq.push('lockBatchCodeGeneration');
      });
      inboundRepo.isBatchCodeTaken.mockImplementation(async () => {
        seq.push('isBatchCodeTaken');
        return false;
      });
      inboundRepo.insertBatch.mockImplementation(async () => {
        seq.push('insertBatch');
        return { id: 1 } as never;
      });
      inboundRepo.updateReceiptItemBatchLink.mockResolvedValue(undefined as never);
      inboundRepo.updateReceiptStatus.mockResolvedValue(undefined as never);
      inboundRepo.updateBatchStatus.mockResolvedValue(undefined as never);
      inboundRepo.upsertInventory.mockResolvedValue(undefined as never);
      inboundRepo.insertInventoryTransaction.mockResolvedValue(undefined as never);

      await service.completeReceipt(receiptId);

      expect(seq).toEqual([
        'lockBatchCodeGeneration',
        'isBatchCodeTaken',
        'insertBatch',
      ]);
    });
  });

  describe('approveReceiptVariance', () => {
    it('should persist variance approval in transaction', async () => {
      inboundRepo.findReceiptWithLock.mockResolvedValue({
        status: 'draft',
      } as never);
      inboundRepo.approveVariance.mockResolvedValue(undefined as never);

      await service.approveReceiptVariance('rid', {
        userId: 'u-mgr',
      } as RequestWithUser['user']);

      expect(inboundRepo.approveVariance).toHaveBeenCalledWith(
        mockTx,
        'rid',
        'u-mgr',
      );
    });
  });

  describe('removeDraftReceipt', () => {
    it('should delete draft receipt via repository', async () => {
      const id = 'r-del';
      inboundRepo.findReceiptById.mockResolvedValue({
        status: ReceiptStatus.DRAFT,
      } as never);
      inboundRepo.deleteReceipt.mockResolvedValue(undefined as never);

      const result = await service.removeDraftReceipt(id);

      expect(inboundRepo.findReceiptById).toHaveBeenCalledWith(id);
      expect(inboundRepo.deleteReceipt).toHaveBeenCalledWith(id);
      expect(result).toEqual({ message: 'Success' });
    });

    it('should throw NotFoundException when receipt missing', async () => {
      inboundRepo.findReceiptById.mockResolvedValue(null as never);
      await expect(service.removeDraftReceipt('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(inboundRepo.deleteReceipt).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when status is not draft', async () => {
      inboundRepo.findReceiptById.mockResolvedValue({
        status: ReceiptStatus.COMPLETED,
      } as never);
      await expect(service.removeDraftReceipt('r1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.removeDraftReceipt('r1')).rejects.toThrow(
        'Chỉ có thể xóa phiếu nhập ở trạng thái Nháp',
      );
      expect(inboundRepo.deleteReceipt).not.toHaveBeenCalled();
    });
  });

  describe('deleteBatchItem', () => {
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

  describe('getAllReceipts', () => {
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

  describe('reprintBatchLabel', () => {
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
      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const result = await service.reprintBatchLabel(dto, user);

      expect(inboundUtils.generateQrData).toHaveBeenCalledWith(mockBatch);
      expect(loggerSpy).toHaveBeenCalled();
      expect(result.qrData).toBe('QR_MOCK_DATA');

      loggerSpy.mockRestore();
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
