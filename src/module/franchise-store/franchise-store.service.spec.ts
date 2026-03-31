/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { WarehouseService } from '../warehouse/warehouse.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { FranchiseStoreRepository } from './franchise-store.repository';
import { FranchiseStoreService } from './franchise-store.service';

describe('FranchiseStoreService', () => {
  let service: FranchiseStoreService;
  let franchiseStoreRepo: jest.Mocked<FranchiseStoreRepository>;
  let warehouseService: jest.Mocked<WarehouseService>;
  let mockTx: jest.Mocked<FranchiseStoreRepository>;
  let mockDb: { transaction: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      transaction: jest.fn(
        async (
          callback: (
            tx: jest.Mocked<FranchiseStoreRepository>,
          ) => Promise<unknown>,
        ) => {
          return callback(mockTx);
        },
      ),
    };

    const mockFranchiseStoreRepoObj = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      getStoreReliability: jest.fn(),
      getDemandPattern: jest.fn(),
      insertStaffUser: jest.fn(),
      findUserById: jest.fn(),
      isEmailTaken: jest.fn(),
      updateStaffUser: jest.fn(),
      findPendingFranchiseStaff: jest.fn(),
    };

    const mockWarehouseServiceObj = {
      createDefaultWarehouse: jest.fn(),
    };

    mockTx =
      mockFranchiseStoreRepoObj as unknown as jest.Mocked<FranchiseStoreRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FranchiseStoreService,
        {
          provide: FranchiseStoreRepository,
          useValue: mockFranchiseStoreRepoObj,
        },
        {
          provide: WarehouseService,
          useValue: mockWarehouseServiceObj,
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<FranchiseStoreService>(FranchiseStoreService);
    franchiseStoreRepo = module.get(FranchiseStoreRepository);
    warehouseService = module.get(WarehouseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createStore', () => {
    it('should create store successfully and create default warehouse', async () => {
      const dto: CreateStoreDto = {
        name: 'Store 1',
        address: 'Dia chi 1',
        phone: '123456789',
      };

      const storeRes = { id: 's-1', name: 'Store 1', isActive: true };
      franchiseStoreRepo.create.mockResolvedValue(storeRes as never);

      const result = await service.createStore(dto);

      expect(result).toEqual(storeRes);
      expect(franchiseStoreRepo.create).toHaveBeenCalledWith(dto, mockTx);
      expect(warehouseService.createDefaultWarehouse).toHaveBeenCalledWith(
        's-1',
        'Store 1',
        mockTx,
      );
    });

    it('should throw InternalServerErrorException if store creation fails loosely', async () => {
      franchiseStoreRepo.create.mockResolvedValue(null as never);
      await expect(service.createStore({} as CreateStoreDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAll', () => {
    it('should retrieve correctly with pagination meta', async () => {
      const filter = { page: 1, limit: 10 } as GetStoresFilterDto;
      const expectedReturn = {
        items: [{ id: 's-1' }],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
      };

      franchiseStoreRepo.findAll.mockResolvedValue(expectedReturn as never);

      const result = await service.findAll(filter);

      expect(result.items).toBeDefined();
      expect(result.meta).toEqual(expectedReturn.meta);
      expect(franchiseStoreRepo.findAll).toHaveBeenCalledWith({
        isActive: true,
        ...filter,
      });
    });
  });

  describe('findOne', () => {
    it('should return a valid active store', async () => {
      const mockStore = { id: 's-1', isActive: true };
      franchiseStoreRepo.findById.mockResolvedValue(mockStore as never);
      expect(await service.findOne('s-1')).toEqual(mockStore);
    });

    it('should throw NotFoundException if not found', async () => {
      franchiseStoreRepo.findById.mockResolvedValue(null as never);
      await expect(service.findOne('s-1')).rejects.toThrow(
        new NotFoundException('Không tìm thấy cửa hàng'),
      );
    });

    it('should throw BadRequestException if store is inactive', async () => {
      franchiseStoreRepo.findById.mockResolvedValue({
        id: 's-1',
        isActive: false,
      } as never);
      await expect(service.findOne('s-1')).rejects.toThrow(
        new BadRequestException('Cửa hàng đã không còn hoạt động'),
      );
    });
  });

  describe('update', () => {
    it('should throw ConflictException if phone logic triggers in repository db constraint (Mocking)', async () => {
      franchiseStoreRepo.findById.mockResolvedValue({
        id: 's-1',
        isActive: true,
      } as never);
      franchiseStoreRepo.update.mockRejectedValue(
        new ConflictException('Số điện thoại đã được sử dụng'),
      );

      await expect(
        service.update('s-1', { phone: '0901234567' } as UpdateStoreDto),
      ).rejects.toThrow(new ConflictException('Số điện thoại đã được sử dụng'));
    });
  });

  describe('getStoreReliability (Analytics)', () => {
    it('should calculate and map correctly', async () => {
      // Mock Data
      const mockAnalytics = [
        {
          storeId: 's-1',
          storeName: 'A',
          totalShipments: 10,
          totalClaims: 0,
          totalDamaged: 0,
          totalMissing: 0,
        },
        {
          storeId: 's-2',
          storeName: 'B',
          totalShipments: 10,
          totalClaims: 5,
          totalDamaged: 5,
          totalMissing: 0,
        }, // high
      ];
      franchiseStoreRepo.getStoreReliability.mockResolvedValue(
        mockAnalytics as never,
      );

      const result = await service.getStoreReliability();

      expect(result.systemAverage.totalShipments).toBe(20);
      expect(result.systemAverage.totalClaims).toBe(5);
      expect(result.systemAverage.averageClaimRatePercentage).toBe(25);

      // Store 2 Fraud since claimRate 0.5 > Sys (0.25) * 1.5 = 0.375 and claims >= 3
      expect(result.storeAnalysis[0].isFraudWarning).toBe(true);
      expect(result.storeAnalysis[0].storeName).toBe('B');
    });
  });
});
