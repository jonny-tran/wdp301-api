import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepo: jest.Mocked<Partial<WarehouseRepository>>;

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCentralWarehouseId', () => {
    it('should return warehouse id when found', async () => {
      // Arrange
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue({
        id: 1,
      });

      // Act
      const id = await service.getCentralWarehouseId();

      // Assert
      expect(id).toBe(1);
    });

    it('should throw NotFoundException when not found with Vietnamese message', async () => {
      // Arrange
      (warehouseRepo.findCentralWarehouseId as jest.Mock).mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(service.getCentralWarehouseId()).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCentralWarehouseId()).rejects.toThrow(
        'Không tìm thấy Kho Trung Tâm trong hệ thống.',
      );
    });
  });
});
