/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CreateProductDto } from './dto/create-product.dto';
import { GetBatchesDto } from './dto/get-batches.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

describe('ProductController', () => {
  let controller: ProductController;
  let productService: jest.Mocked<ProductService>;

  beforeEach(async () => {
    const mockProductService = {
      createProduct: jest.fn(),
      getProducts: jest.fn(),
      getProduct: jest.fn(),
      updateProduct: jest.fn(),
      removeProduct: jest.fn(),
      restoreProduct: jest.fn(),
      getBatches: jest.fn(),
      getBatch: jest.fn(),
      updateBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        {
          provide: ProductService,
          useValue: mockProductService,
        },
      ],
    }).compile();

    controller = module.get<ProductController>(ProductController);
    productService = module.get(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a product and verify response payload', async () => {
      // Arrange
      const dto: CreateProductDto = {
        name: 'Item',
        baseUnitId: 1,
        shelfLifeDays: 1,
        imageUrl: 'img.jpg',
      };
      const expectedOutput = { id: 1, name: 'Item', sku: 'ITEM' };
      productService.createProduct.mockResolvedValue(expectedOutput as never);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(productService.createProduct).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedOutput); // In nestjs interceptors handles wrapping response with success msg
    });
  });

  describe('update', () => {
    it('should update a product and verify JSON response consistency', async () => {
      // Arrange
      const dto: UpdateProductDto = { name: 'Item Upd' };
      const expectedOutput = { id: 1, name: 'Item Upd' };
      productService.updateProduct.mockResolvedValue(expectedOutput as never);

      // Act
      const result = await controller.update(1, dto);

      // Assert
      expect(productService.updateProduct).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(expectedOutput);
    });
  });

  describe('findOne', () => {
    it('should return one product and verify JSON response consistency', async () => {
      // Arrange
      const expectedOutput = { id: 1, name: 'Item' };
      productService.getProduct.mockResolvedValue(expectedOutput as never);

      // Act
      const result = await controller.findOne(1);

      // Assert
      expect(productService.getProduct).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedOutput);
    });
  });

  describe('findAll', () => {
    it('should return products with pagination metadata', async () => {
      // Arrange
      const filter: GetProductsDto = { page: 1, limit: 10 };
      const mockResult = {
        items: [],
        meta: {
          currentPage: 1,
          itemsPerPage: 10,
          itemCount: 0,
          totalPages: 0,
          totalItems: 0,
        },
      };
      productService.getProducts.mockResolvedValue(mockResult as never);

      // Act
      const result = await controller.findAll(filter);

      // Assert
      expect(productService.getProducts).toHaveBeenCalledWith(filter);
      expect(result.meta).toBeDefined();
      expect(result.meta.currentPage).toEqual(1);
    });
  });

  describe('findOneBatch', () => {
    it('should resolve batch by id string and by batch_code', async () => {
      const byId = { id: 42, batchCode: 'X' };
      productService.getBatch.mockResolvedValue(byId as never);

      await expect(controller.findOneBatch('42')).resolves.toEqual(byId);
      expect(productService.getBatch).toHaveBeenCalledWith('42');

      const byCode = {
        id: 42,
        batchCode: 'PCC300STFG-20260401-3CAC3C24',
      };
      productService.getBatch.mockResolvedValue(byCode as never);

      await expect(
        controller.findOneBatch('PCC300STFG-20260401-3CAC3C24'),
      ).resolves.toEqual(byCode);
      expect(productService.getBatch).toHaveBeenCalledWith(
        'PCC300STFG-20260401-3CAC3C24',
      );
    });
  });

  describe('findAllBatches', () => {
    it('should return batches with pagination metadata', async () => {
      // Arrange
      const filter: GetBatchesDto = { page: 1, limit: 10 };
      const mockResult = {
        items: [],
        meta: {
          currentPage: 1,
          itemsPerPage: 10,
          itemCount: 0,
          totalPages: 0,
          totalItems: 0,
        },
      };
      productService.getBatches.mockResolvedValue(mockResult as never);

      // Act
      const result = await controller.findAllBatches(filter);

      // Assert
      expect(productService.getBatches).toHaveBeenCalledWith(filter);
      expect(result.meta).toBeDefined();
      expect(result.meta.currentPage).toEqual(1);
    });
  });
});
