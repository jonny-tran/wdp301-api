/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { ClaimService } from '../claim/claim.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from './constants/shipment-status.enum';
import { UserRole } from '../auth/dto/create-user.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService } from './shipment.service';

describe('ShipmentService', () => {
  let service: ShipmentService;
  let shipmentRepository: jest.Mocked<ShipmentRepository>;
  let inventoryService: jest.Mocked<InventoryService>;
  let claimService: jest.Mocked<ClaimService>;

  const mockDb = {} as NodePgDatabase<typeof schema>;

  beforeEach(async () => {
    const mockShipmentRepository = {
      findAll: jest.fn(),
      createShipment: jest.fn(),
      createShipmentItems: jest.fn(),
      getShipmentWithItems: jest.fn(),
      findIncomingShipments: jest.fn(),
      getShipmentById: jest.fn(),
      updateShipmentStatus: jest.fn(),
      findWarehouseById: jest.fn(),
      updateOrderStatus: jest.fn(),
    };

    const mockInventoryRepository = {
      findWarehouseByStoreId: jest.fn(),
    };

    const mockInventoryService = {
      updateInventory: jest.fn(),
      logInventoryTransaction: jest.fn(),
    };

    const mockClaimService = {
      createClaim: jest.fn(),
    };

    const mockUnitOfWork = {
      runInTransaction: jest.fn((cb) => cb(mockDb)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentService,
        {
          provide: ShipmentRepository,
          useValue: mockShipmentRepository,
        },
        {
          provide: InventoryRepository,
          useValue: mockInventoryRepository,
        },
        {
          provide: InventoryService,
          useValue: mockInventoryService,
        },
        {
          provide: ClaimService,
          useValue: mockClaimService,
        },
        {
          provide: UnitOfWork,
          useValue: mockUnitOfWork,
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ShipmentService>(ShipmentService);
    shipmentRepository = module.get(ShipmentRepository);
    inventoryService = module.get(InventoryService);
    claimService = module.get(ClaimService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getShipmentDetail', () => {
    it('should throw NotFoundException if shipment id does not exist', async () => {
      shipmentRepository.getShipmentById.mockResolvedValueOnce(undefined);

      await expect(
        service.getShipmentDetail(
          'invalid-id',
          'store-1',
          UserRole.FRANCHISE_STORE_STAFF,
        ),
      ).rejects.toThrow(
        new NotFoundException('Không tìm thấy phiếu giao hàng'),
      );
    });

    it('should throw ForbiddenException if shipment does not belong to store', async () => {
      shipmentRepository.getShipmentById.mockResolvedValueOnce({
        id: 'ship-1',
        toWarehouseId: 10,
        order: {
          id: 'order-1',
          storeId: 'store-2',
          store: { name: 'Store 2' },
        },
        items: [],
      } as any);

      shipmentRepository.findWarehouseById.mockResolvedValueOnce({
        id: 10,
        storeId: 'different-store',
      } as any);

      await expect(
        service.getShipmentDetail(
          'ship-1',
          'store-1',
          UserRole.FRANCHISE_STORE_STAFF,
        ),
      ).rejects.toThrow(
        new ForbiddenException('Bạn không có quyền xem chuyến hàng này'),
      );
    });

    it('should return shipment detail with items sorted by expiryDate (FEFO)', async () => {
      const mockShipment = {
        id: 'ship-1',
        orderId: 'order-1',
        status: ShipmentStatus.IN_TRANSIT,
        createdAt: new Date(),
        toWarehouseId: 10,
        order: {
          id: 'order-1',
          storeId: 'store-1',
          store: { name: 'Store 1' },
        },
        items: [
          {
            batchId: 2,
            quantity: '5',
            batch: {
              batchCode: 'B002',
              expiryDate: '2027-01-01',
              product: { name: 'Product B', sku: 'SKU2', imageUrl: 'img2' },
            },
          },
          {
            batchId: 1,
            quantity: '10',
            batch: {
              batchCode: 'B001',
              expiryDate: '2026-01-01',
              product: { name: 'Product A', sku: 'SKU1', imageUrl: 'img1' },
            },
          },
        ],
      } as any;

      shipmentRepository.getShipmentById.mockResolvedValueOnce(mockShipment);
      shipmentRepository.findWarehouseById.mockResolvedValueOnce({
        storeId: 'store-1',
      } as any);

      const result = await service.getShipmentDetail(
        'ship-1',
        'store-1',
        UserRole.FRANCHISE_STORE_STAFF,
      );

      expect(result.id).toEqual('ship-1');
      expect(result.order?.storeId).toEqual('store-1');
      expect(result.items).toHaveLength(2);
      // Verify FEFO: B001 (2026) comes before B002 (2027)
      expect(result.items[0].batchCode).toEqual('B001');
      expect(result.items[1].batchCode).toEqual('B002');
    });
  });

  describe('receiveShipment (Trọng tâm KFC Model)', () => {
    const defaultShipment = {
      id: 'ship-completed',
      orderId: 'order-1',
      status: ShipmentStatus.IN_TRANSIT,
      toWarehouseId: 15,
      order: { storeId: 'store-1' },
      items: [
        {
          batchId: 1,
          quantity: '100',
          batch: {
            productId: 10,
            batchCode: 'B01',
            expiryDate: '2026-01-01',
            product: { name: 'A' },
          },
        },
      ],
    } as any;

    it('should throw NotFoundException if shipment not found', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce(undefined);
      await expect(
        service.receiveShipment(
          'invalid-id',
          {} as ReceiveShipmentDto,
          'user-1',
          'store-1',
        ),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy chuyến hàng'));
    });

    it('should throw ForbiddenException if store does not match', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce(
        defaultShipment,
      );
      await expect(
        service.receiveShipment(
          'ship-completed',
          {} as ReceiveShipmentDto,
          'user-1',
          'wrong-store',
        ),
      ).rejects.toThrow(
        new ForbiddenException('Chuyến hàng không thuộc về cửa hàng của bạn'),
      );
    });

    it('should throw BadRequestException if shipment status is not IN_TRANSIT', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce({
        ...defaultShipment,
        status: ShipmentStatus.COMPLETED,
      });
      await expect(
        service.receiveShipment(
          'ship-completed',
          {} as ReceiveShipmentDto,
          'user-1',
          'store-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if damaged quantity is higher than received quantity', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce(
        defaultShipment,
      );

      const dto: ReceiveShipmentDto = {
        items: [{ batchId: 1, actualQty: 10, damagedQty: 20 }],
      };

      await expect(
        service.receiveShipment('ship-completed', dto, 'user-1', 'store-1'),
      ).rejects.toThrow(
        new BadRequestException(
          'Lỗi dữ liệu lô B01: Số lượng hỏng (20) lớn hơn số lượng thực nhận (10).',
        ),
      );
    });

    it('should receive shipment fully and update inventory', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce(
        defaultShipment,
      );

      const dto: ReceiveShipmentDto = { items: [] }; // receive all

      const result = await service.receiveShipment(
        'ship-completed',
        dto,
        'user-1',
        'store-1',
      );

      expect(inventoryService.updateInventory).toHaveBeenCalledWith(
        15,
        1,
        100,
        expect.anything(),
      );
      expect(inventoryService.logInventoryTransaction).toHaveBeenCalledWith(
        15,
        1,
        'import',
        100,
        'ship-completed',
        'Shipment Receipt',
        expect.anything(),
      );
      expect(shipmentRepository.updateShipmentStatus).toHaveBeenCalledWith(
        'ship-completed',
        ShipmentStatus.COMPLETED,
        expect.anything(),
      );
      expect(shipmentRepository.updateOrderStatus).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.COMPLETED,
        expect.anything(),
      );
      expect(claimService.createClaim).not.toHaveBeenCalled();

      expect(result.message).toEqual('Xác nhận nhận hàng thành công.');
      expect(result.hasDiscrepancy).toBeFalsy();
    });

    it('should create claim if actual received is less than shipped', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce({
        ...defaultShipment,
        items: [
          {
            batchId: 2,
            quantity: '50',
            batch: {
              productId: 20,
              batchCode: 'B02',
              expiryDate: '2026-05-05',
              product: { name: 'B' },
            },
          },
        ],
      });

      claimService.createClaim.mockResolvedValueOnce({
        id: 'claim-123',
      } as any);

      // shipped 50, actual received 40, damaged 5
      const dto: ReceiveShipmentDto = {
        items: [
          {
            batchId: 2,
            actualQty: 40,
            damagedQty: 5,
            evidenceUrls: ['img.png'],
          },
        ],
      };

      const result = await service.receiveShipment(
        'ship-completed',
        dto,
        'user-1',
        'store-1',
      );

      // Good qty = actual (40) - damaged (5) = 35.
      // Verify store inventory only increases by the actual good quantity!
      expect(inventoryService.updateInventory).toHaveBeenCalledWith(
        15,
        2,
        35,
        expect.anything(),
      );

      // Should automatically call createClaim with discrepancy info
      expect(claimService.createClaim).toHaveBeenCalledWith(
        'ship-completed',
        'user-1',
        [
          {
            productId: 20,
            quantityMissing: 10, // 50 shipped - 40 actual = 10 missing
            quantityDamaged: 5,
            reason: 'Thiếu: 10, Hỏng: 5',
            imageUrl: 'img.png',
          },
        ],
        expect.anything(),
      );

      // Verify order status is CLAIMED
      expect(shipmentRepository.updateOrderStatus).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CLAIMED,
        expect.anything(),
      );

      expect(result.hasDiscrepancy).toBeTruthy();
      expect(result.claimId).toEqual('claim-123');
    });

    it('should receive shipment correctly when receiving zero valid items (all missing/damaged)', async () => {
      shipmentRepository.getShipmentWithItems.mockResolvedValueOnce(
        defaultShipment,
      );
      claimService.createClaim.mockResolvedValueOnce({
        id: 'claim-abc',
      } as any);

      const dto: ReceiveShipmentDto = {
        items: [{ batchId: 1, actualQty: 50, damagedQty: 50 }], // shipped 100, received 50, damaged 50 -> good: 0
      };

      await service.receiveShipment('ship-completed', dto, 'user-1', 'store-1');

      // goodQty = 0, so inventory update should NOT be called
      expect(inventoryService.updateInventory).not.toHaveBeenCalled();

      expect(claimService.createClaim).toHaveBeenCalledWith(
        'ship-completed',
        'user-1',
        [
          {
            productId: 10,
            quantityMissing: 50,
            quantityDamaged: 50,
            reason: 'Thiếu: 50, Hỏng: 50',
            imageUrl: undefined,
          },
        ],
        expect.anything(),
      );

      expect(shipmentRepository.updateOrderStatus).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CLAIMED,
        expect.anything(),
      );
    });
  });
});
