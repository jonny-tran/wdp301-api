/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BaseUnitRepository } from './base-unit/base-unit.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<ProductRepository>;
  let baseUnitRepository: jest.Mocked<BaseUnitRepository>;

  beforeEach(async () => {
    const mockProductRepo = {
      findBySku: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      findOneWithBatches: jest.fn(),
      findAll: jest.fn(),
      softDelete: jest.fn(),
      findAllInactive: jest.fn(),
      restore: jest.fn(),
      findAllBatches: jest.fn(),
      findBatchById: jest.fn(),
      findBatchByIdOrKey: jest.fn(),
      updateBatch: jest.fn(),
      createBatch: jest.fn(),
      findCentralWarehouseId: jest.fn(),
    };

    const mockBaseUnitRepo = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: ProductRepository,
          useValue: mockProductRepo,
        },
        {
          provide: BaseUnitRepository,
          useValue: mockBaseUnitRepo,
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    productRepository = module.get(ProductRepository);
    baseUnitRepository = module.get(BaseUnitRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create a new product successfully', async () => {
      // Arrange
      const dto: CreateProductDto = {
        name: 'Gà rán KFC',
        baseUnitId: 1,
        shelfLifeDays: 3,
        imageUrl: 'http://image.url',
      };
      productRepository.findBySku.mockResolvedValue(null as never);
      baseUnitRepository.findById.mockResolvedValue({
        id: 1,
        name: 'Cái',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      productRepository.create.mockResolvedValue({
        ...dto,
        id: 1,
        sku: 'GA-RAN-KFC',
        baseUnitName: 'Cái',
        type: 'raw_material',
        isActive: true,
        minStockLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.createProduct(dto);

      // Assert
      expect(productRepository.findBySku).toHaveBeenCalled();
      expect(baseUnitRepository.findById).toHaveBeenCalledWith(1);
      expect(productRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Gà rán KFC',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sku: expect.any(String),
        }),
      );
      expect(result).toBeDefined();
      expect(result.id).toEqual(1);
    });

    it('should throw ConflictException if SKU already exists', async () => {
      // Arrange
      const dto: CreateProductDto = {
        name: 'Thịt Gà',
        baseUnitId: 1,
        shelfLifeDays: 5,
        imageUrl: 'http://img.com',
      };
      productRepository.findBySku.mockResolvedValue({ id: 1 } as never);

      // Act & Assert
      await expect(service.createProduct(dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createProduct(dto)).rejects.toThrow(
        'Mã sản phẩm đã tồn tại',
      );
    });
  });

  describe('createBatch', () => {
    it('should create a new batch successfully with explicit expiryDate', async () => {
      // Arrange
      productRepository.findById.mockResolvedValue({
        id: 1,
        sku: 'PROD-1',
        shelfLifeDays: 5,
      } as never);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      productRepository.createBatch.mockResolvedValue({
        id: 1,
        batchCode: 'L-PROD-1',
        expiryDate: futureDateStr,
        product: { id: 1, name: 'Prod' },
      } as never);

      // Act
      const result = await service.createBatch(1, undefined, futureDateStr);

      // Assert
      expect(productRepository.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 1,
          expiryDate: futureDateStr,
        }),
      );
      expect(result).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).product).toBeDefined();
    });

    it('should throw BadRequestException if expiry_date is in the past', async () => {
      // Arrange
      productRepository.findById.mockResolvedValue({
        id: 1,
        sku: 'PROD-1',
        shelfLifeDays: 5,
      } as never);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      // Act & Assert
      await expect(
        service.createBatch(1, undefined, pastDateStr),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createBatch(1, undefined, pastDateStr),
      ).rejects.toThrow('Hạn sử dụng không được là ngày trong quá khứ');
    });

    it('should throw NotFoundException if Product is not found', async () => {
      // Arrange
      productRepository.findById.mockResolvedValue(null as never);

      // Act & Assert
      await expect(service.createBatch(99)).rejects.toThrow(NotFoundException);
      await expect(service.createBatch(99)).rejects.toThrow(
        'Sản phẩm không tồn tại',
      );
    });
  });

  describe('getBatches (FEFO & Pagination Verification)', () => {
    it('should return paginated batches and correctly mapped FEFO format', async () => {
      // Arrange
      const filter = { page: 1, limit: 10 };
      const mockBatches = [
        {
          id: 2,
          batchCode: 'L2',
          expiryDate: '2026-06-01',
          currentQuantity: '20',
        },
        {
          id: 1,
          batchCode: 'L1',
          expiryDate: '2026-06-15',
          currentQuantity: '50',
        },
      ];
      const mockResponse = {
        items: mockBatches,
        meta: { totalItems: 2, page: 1, limit: 10, totalPages: 1 },
      };

      productRepository.findAllBatches.mockResolvedValue(mockResponse as never);

      // Act
      const result = await service.getBatches(filter as never);

      // Assert
      expect(productRepository.findAllBatches).toHaveBeenCalledWith(filter);
      // Validate Service returns exact expiry_date ASC sort as provided by Repo
      expect(result.items.length).toBe(2);
      expect(result.items[0].batchCode).toBe('L2');
      expect(result.items[1].batchCode).toBe('L1');
      expect(new Date(result.items[0].expiryDate).getTime()).toBeLessThan(
        new Date(result.items[1].expiryDate).getTime(),
      );
    });
  });

  describe('removeProduct & restoreProduct (Soft Delete)', () => {
    it('should soft delete product successfully', async () => {
      productRepository.findById.mockResolvedValue({
        id: 1,
        isActive: true,
      } as never);
      productRepository.softDelete.mockResolvedValue({
        id: 1,
        isActive: false,
      } as never);

      const result = await service.removeProduct(1);

      expect(productRepository.findById).toHaveBeenCalledWith(1);
      expect(productRepository.softDelete).toHaveBeenCalledWith(1);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if product not found to remove', async () => {
      productRepository.findById.mockResolvedValue(null as never);
      await expect(service.removeProduct(99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should restore product successfully', async () => {
      productRepository.findById.mockResolvedValue({
        id: 1,
        isActive: false,
      } as never);
      productRepository.restore.mockResolvedValue({
        id: 1,
        isActive: true,
      } as never);

      const result = await service.restoreProduct(1);

      expect(productRepository.findById).toHaveBeenCalledWith(1);
      expect(productRepository.restore).toHaveBeenCalledWith(1);
      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException if product not found to restore', async () => {
      productRepository.findById.mockResolvedValue(null as never);
      await expect(service.restoreProduct(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProducts (Search & Filter)', () => {
    it('should return products based on filter', async () => {
      const filter = { search: 'KFC', page: 1, limit: 10 };
      const mockResponse = {
        items: [{ id: 1, name: 'Gà rán KFC' }],
        meta: { totalItems: 1 },
      };
      productRepository.findAll.mockResolvedValue(mockResponse as never);

      const result = await service.getProducts(filter as never);

      expect(productRepository.findAll).toHaveBeenCalledWith(filter);
      expect(result.items.length).toBe(1);
    });
  });

  describe('getBatch (ID hoặc batch_code)', () => {
    it('should return batch when key is numeric id', async () => {
      const row = { id: 42, batchCode: 'X-1' };
      productRepository.findBatchByIdOrKey.mockResolvedValue(row as never);

      const result = await service.getBatch('42');

      expect(productRepository.findBatchByIdOrKey).toHaveBeenCalledWith('42');
      expect(result).toEqual(row);
    });

    it('should return batch when key is batch_code', async () => {
      const code = 'PCC300STFG-20260401-3CAC3C24';
      const row = { id: 42, batchCode: code };
      productRepository.findBatchByIdOrKey.mockResolvedValue(row as never);

      const result = await service.getBatch(code);

      expect(productRepository.findBatchByIdOrKey).toHaveBeenCalledWith(code);
      expect(result).toEqual(row);
    });

    it('should throw NotFoundException when batch missing', async () => {
      productRepository.findBatchByIdOrKey.mockResolvedValue(null);

      await expect(service.getBatch('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateBatch (Batch Status & Quantity)', () => {
    it('should update batch status correctly', async () => {
      productRepository.findBatchById.mockResolvedValue({ id: 1 } as never);
      productRepository.updateBatch.mockResolvedValue({
        id: 1,
        batchStatus: 'expired',
      } as never);

      const dto = { batchStatus: 'expired' } as never;
      const result = await service.updateBatch(1, dto);

      expect(productRepository.updateBatch).toHaveBeenCalledWith(
        1,
        dto,
        undefined,
      );
      expect(result!.batchStatus).toBe('expired');
    });
  });
});
