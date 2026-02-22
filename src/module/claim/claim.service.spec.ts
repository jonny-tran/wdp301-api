import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { InventoryRepository } from '../inventory/inventory.repository';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from '../shipment/constants/shipment-status.enum';
import { ShipmentRepository } from '../shipment/shipment.repository';
import { ClaimRepository } from './claim.repository';
import { ClaimService } from './claim.service';
import { ClaimStatus } from './constants/claim-status.enum';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { GetClaimsDto } from './dto/get-claims.dto';

const mockClaimResult = {
  id: 'claim-123',
  shipmentId: 'shipment-123',
  status: 'pending',
  createdAt: new Date(),
  resolvedAt: null,
  store: { id: 'store-1', name: 'Test Store' },
  shipment: { id: 'shipment-123' },
};

describe('ClaimService', () => {
  let service: ClaimService;
  let claimRepo: jest.Mocked<Partial<ClaimRepository>>;
  let shipmentRepo: jest.Mocked<Partial<ShipmentRepository>>;
  let inventoryRepo: jest.Mocked<Partial<InventoryRepository>>;
  let uow: jest.Mocked<Partial<UnitOfWork>>;

  beforeEach(async () => {
    claimRepo = {
      findAll: jest.fn(),
      getShipmentForValidation: jest.fn(),
      createClaim: jest.fn(),
      createClaimItems: jest.fn(),
      getClaimById: jest.fn(),
      updateClaimStatus: jest.fn(),
      getDiscrepancyAnalytics: jest.fn(),
    };

    shipmentRepo = {
      updateOrderStatus: jest.fn(),
    };

    inventoryRepo = {
      getBatchQuantity: jest.fn(),
      adjustBatchQuantity: jest.fn(),
      createInventoryTransaction: jest.fn(),
    };

    uow = {
      runInTransaction: jest
        .fn()
        .mockImplementation(
          <T>(cb: (tx: NodePgDatabase<typeof schema>) => Promise<T>) =>
            cb({} as NodePgDatabase<typeof schema>),
        ) as unknown as UnitOfWork['runInTransaction'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimService,
        { provide: ClaimRepository, useValue: claimRepo },
        { provide: ShipmentRepository, useValue: shipmentRepo },
        { provide: InventoryRepository, useValue: inventoryRepo },
        { provide: UnitOfWork, useValue: uow },
      ],
    }).compile();

    service = module.get<ClaimService>(ClaimService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated or list of claims with consistent response schema', async () => {
      // Arrange
      const query = { page: 1, limit: 10 };
      jest
        .spyOn(claimRepo, 'findAll')
        .mockResolvedValue([mockClaimResult] as never);

      // Act
      const result = await service.findAll(query as GetClaimsDto);

      // Assert
      expect(claimRepo.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual([mockClaimResult]);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('shipmentId');
      expect(result[0]).toHaveProperty('status');
      expect(result[0]).toHaveProperty('store');
      expect(result[0]).toHaveProperty('shipment');
    });
  });

  describe('getClaims', () => {
    it('should filter by storeId if user role is FRANCHISE_STORE_STAFF (Data Isolation)', async () => {
      // Arrange
      const query = { page: 1 };
      const user = { role: 'FRANCHISE_STORE_STAFF', storeId: 'staff-store-id' };
      jest.spyOn(claimRepo, 'findAll').mockResolvedValue([] as never);

      // Act
      await service.getClaims(query as GetClaimsDto, user);

      // Assert
      expect(query).toHaveProperty('storeId', 'staff-store-id');
      expect(claimRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'staff-store-id' }),
      );
    });
  });

  describe('createClaimFromShipment', () => {
    it('should throw BadRequestException if shipment status is not DELIVERED', async () => {
      // Arrange
      const shipmentId = 'ship-1';
      const items = [{ batchId: 10, quantityReceived: 5 }];
      jest.spyOn(claimRepo, 'getShipmentForValidation').mockResolvedValue({
        status: ShipmentStatus.IN_TRANSIT,
      } as never);

      // Act & Assert
      await expect(
        service.createClaimFromShipment(shipmentId, items),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createClaimFromShipment(shipmentId, items),
      ).rejects.toThrow('Chỉ có thể khiếu nại đơn hàng đã giao thành công');
    });

    it('should call invento  ryRepo.adjustBatchQuantity for each Batch with quantity_received', async () => {
      // Arrange
      const shipmentId = 'ship-1';
      const items = [{ batchId: 10, quantityReceived: 5 }];
      jest.spyOn(claimRepo, 'getShipmentForValidation').mockResolvedValue({
        status: ShipmentStatus.DELIVERED,
        toWarehouseId: 1,
      } as never);
      jest
        .spyOn(inventoryRepo, 'adjustBatchQuantity')
        .mockResolvedValue(undefined as never);

      // Act
      const result = await service.createClaimFromShipment(shipmentId, items);

      // Assert
      expect(inventoryRepo.adjustBatchQuantity).toHaveBeenCalledWith(
        1,
        10,
        5,
        expect.anything(),
      );
      expect(result.status).toBe('success');
    });
  });

  describe('createManualClaim', () => {
    it('should throw NotFoundException if shipment not found', async () => {
      // Arrange
      jest
        .spyOn(claimRepo, 'getShipmentForValidation')
        .mockResolvedValue(null as never);

      const dto: CreateManualClaimDto = {
        shipmentId: 'invalid-id',
        items: [],
      };

      // Act & Assert
      await expect(
        service.createManualClaim(dto, 'user-1', 'store-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createManualClaim(dto, 'user-1', 'store-1'),
      ).rejects.toThrow('Không tìm thấy chuyến hàng');
    });

    it('should throw BadRequestException if item total quantity exceeds inventory (quantity missing + damaged > shipped/inventory)', async () => {
      // Arrange
      const shipmentMock = {
        id: 'shipment-1',
        orderId: 'order-1',
        status: ShipmentStatus.COMPLETED,
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        order: { storeId: 'store-1' },
        toWarehouseId: 1,
      };
      jest
        .spyOn(claimRepo, 'getShipmentForValidation')
        .mockResolvedValue(shipmentMock as never);

      const dto: CreateManualClaimDto = {
        shipmentId: 'shipment-1',
        items: [
          {
            productId: 1,
            batchId: 10,
            quantityDamaged: 5,
            quantityMissing: 5, // total 10
            reason: '',
            imageProofUrl: 'http://example.com/proof.jpg',
          },
        ],
      };

      // Kho chỉ có 8 sản phẩm (đã giao)
      jest
        .spyOn(inventoryRepo, 'getBatchQuantity')
        .mockResolvedValue({ quantity: '8' } as never);

      // Act & Assert
      await expect(
        service.createManualClaim(dto, 'user-1', 'store-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createManualClaim(dto, 'user-1', 'store-1'),
      ).rejects.toThrow(
        'Số lượng tồn kho không đủ. Hiện có: 8, Yêu cầu: 10 (Batch 10)',
      );
    });

    it('should throw BadRequestException if damaged goods miss image_proof_url or reason', async () => {
      // Arrange
      const shipmentMock = {
        id: 'shipment-1',
        orderId: 'order-1',
        status: ShipmentStatus.COMPLETED,
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        order: { storeId: 'store-1' },
        toWarehouseId: 1,
      };
      jest
        .spyOn(claimRepo, 'getShipmentForValidation')
        .mockResolvedValue(shipmentMock as never);
      jest
        .spyOn(inventoryRepo, 'getBatchQuantity')
        .mockResolvedValue({ quantity: '20' } as never);

      const dtoMissingImage: CreateManualClaimDto = {
        shipmentId: 'shipment-1',
        items: [
          {
            productId: 1,
            batchId: 10,
            quantityDamaged: 2,
            quantityMissing: 0,
            reason: 'Hỏng do vận chuyển',
            // Missing imageProofUrl
          } as unknown as CreateManualClaimDto['items'][0],
        ],
      };

      const dtoMissingReason: CreateManualClaimDto = {
        shipmentId: 'shipment-1',
        items: [
          {
            productId: 1,
            batchId: 10,
            quantityDamaged: 2,
            quantityMissing: 0,
            imageProofUrl: 'http://img.jpg',
            // Missing reason
          } as unknown as CreateManualClaimDto['items'][0],
        ],
      };

      // Act & Assert
      await expect(
        service.createManualClaim(dtoMissingImage, 'user-1', 'store-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createManualClaim(dtoMissingImage, 'user-1', 'store-1'),
      ).rejects.toThrow(
        'Hàng hỏng bắt buộc phải có ảnh bằng chứng và lý do (Batch 10)',
      );

      await expect(
        service.createManualClaim(dtoMissingReason, 'user-1', 'store-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createManualClaim(dtoMissingReason, 'user-1', 'store-1'),
      ).rejects.toThrow(
        'Hàng hỏng bắt buộc phải có ảnh bằng chứng và lý do (Batch 10)',
      );
    });

    it('should successfully create claim and return consistent result format', async () => {
      // Arrange
      const shipmentMock = {
        id: 'shipment-1',
        orderId: 'order-1',
        status: ShipmentStatus.COMPLETED,
        updatedAt: new Date(),
        order: { storeId: 'store-1' },
        toWarehouseId: 1,
      };
      jest
        .spyOn(claimRepo, 'getShipmentForValidation')
        .mockResolvedValue(shipmentMock as never);
      jest
        .spyOn(inventoryRepo, 'getBatchQuantity')
        .mockResolvedValue({ quantity: '20' } as never);
      jest
        .spyOn(claimRepo, 'createClaim')
        .mockResolvedValue(mockClaimResult as never);
      jest.spyOn(claimRepo, 'createClaimItems').mockResolvedValue([] as never);

      const dto: CreateManualClaimDto = {
        shipmentId: 'shipment-1',
        items: [
          {
            productId: 1,
            batchId: 10,
            quantityDamaged: 2,
            quantityMissing: 1,
            reason: 'Hỏng do vận chuyển',
            imageProofUrl: 'http://example.com/img.jpg',
          },
        ],
      };

      // Act
      const result = await service.createManualClaim(dto, 'user-1', 'store-1');

      // Assert
      expect(result).toEqual(mockClaimResult);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('shipmentId');
      expect(result).toHaveProperty('store');
      expect(result).toHaveProperty('shipment');
      expect(claimRepo.createClaim).toHaveBeenCalled();
      expect(claimRepo.createClaimItems).toHaveBeenCalled();
      expect(inventoryRepo.adjustBatchQuantity).toHaveBeenCalledWith(
        1,
        10,
        -3,
        expect.anything(),
      );
      expect(shipmentRepo.updateOrderStatus).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CLAIMED,
        expect.anything(),
      );
    });
  });

  describe('resolveClaim', () => {
    it('should throw NotFoundException if claim is not found', async () => {
      // Arrange
      jest.spyOn(claimRepo, 'getClaimById').mockResolvedValue(null as never);

      // Act & Assert
      await expect(
        service.resolveClaim('invalid', { status: ClaimStatus.APPROVED }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.resolveClaim('invalid', { status: ClaimStatus.APPROVED }),
      ).rejects.toThrow('Không tìm thấy khiếu nại');
    });

    it('should successfully update claim status and return consistent result', async () => {
      // Arrange
      jest
        .spyOn(claimRepo, 'getClaimById')
        .mockResolvedValue({ status: ClaimStatus.PENDING } as never);
      jest.spyOn(claimRepo, 'updateClaimStatus').mockResolvedValue({
        ...mockClaimResult,
        status: ClaimStatus.APPROVED,
      } as never);

      // Act
      const result = await service.resolveClaim('claim-123', {
        status: ClaimStatus.APPROVED,
      });

      // Assert
      expect(claimRepo.updateClaimStatus).toHaveBeenCalledWith(
        'claim-123',
        ClaimStatus.APPROVED,
      );
      expect(result.status).toBe('approved');
      expect(result).toHaveProperty('store');
      expect(result).toHaveProperty('shipment');
    });
  });
});
