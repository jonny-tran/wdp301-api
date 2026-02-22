/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { GetSuppliersDto } from './dto/get-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepo: jest.Mocked<SupplierRepository>;

  beforeEach(async () => {
    const mockSupplierRepoObj = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        {
          provide: SupplierRepository,
          useValue: mockSupplierRepoObj,
        },
      ],
    }).compile();

    service = module.get<SupplierService>(SupplierService);
    supplierRepo = module.get(SupplierRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a supplier', async () => {
      const dto: CreateSupplierDto = {
        name: 'Supplier A',
        contactName: 'Nguyen A',
        phone: '12345678',
        address: 'Hanoi',
      };

      supplierRepo.create.mockResolvedValue({
        id: 1,
        ...dto,
        isActive: true,
      } as never);

      const result = await service.create(dto);

      expect(result).toHaveProperty('id', 1);
      expect(result.name).toBe('Supplier A');
      expect(supplierRepo.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should retrieve a paginated list of suppliers', async () => {
      const query: GetSuppliersDto = { page: 1, limit: 10 };
      const expectedReturn = {
        items: [{ id: 1, name: 'Supplier A' }],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
      };

      supplierRepo.findAll.mockResolvedValue(expectedReturn as never);

      const result = await service.findAll(query);

      expect(result.items).toBeDefined();
      expect(result.meta).toEqual(expectedReturn.meta);
      expect(supplierRepo.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should format details property returning active supplier', async () => {
      const mockSupplier = { id: 1, name: 'Supp A', isActive: true };
      supplierRepo.findById.mockResolvedValue(mockSupplier as never);

      const result = await service.findOne(1);
      expect(result).toEqual(mockSupplier);
      expect(supplierRepo.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if not found', async () => {
      supplierRepo.findById.mockResolvedValue(null as never);
      await expect(service.findOne(1)).rejects.toThrow(
        new NotFoundException('Không tìm thấy nhà cung cấp'),
      );
    });

    it('should throw NotFoundException if supplier is inactive', async () => {
      supplierRepo.findById.mockResolvedValue({
        id: 2,
        isActive: false,
      } as never);
      await expect(service.findOne(2)).rejects.toThrow(
        new NotFoundException('Nhà cung cấp đã không còn hoạt động'),
      );
    });
  });

  describe('update', () => {
    it('should successfully update supplier', async () => {
      supplierRepo.findById.mockResolvedValue({
        id: 1,
        name: 'Old',
        isActive: true,
      } as never);
      supplierRepo.update.mockResolvedValue({
        id: 1,
        name: 'New Update',
      } as never);

      const dto: UpdateSupplierDto = { name: 'New Update' };
      const result = await service.update(1, dto);

      expect(result.name).toBe('New Update');
      expect(supplierRepo.update).toHaveBeenCalledWith(1, dto);
    });

    it('should throw NotFoundException if trying to update deleted supplier', async () => {
      supplierRepo.findById.mockResolvedValue({
        id: 1,
        isActive: false,
      } as never);
      await expect(service.update(1, {} as UpdateSupplierDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove (Soft Delete)', () => {
    it('should soft delete supplier', async () => {
      supplierRepo.findById.mockResolvedValue({
        id: 1,
        isActive: true,
      } as never);
      supplierRepo.softDelete.mockResolvedValue(true as never);

      const result = await service.remove(1);

      expect(result).toBe(true);
      expect(supplierRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if removing missing supplier', async () => {
      supplierRepo.findById.mockResolvedValue(null as never);
      await expect(service.remove(1)).rejects.toThrow(
        new NotFoundException('Không tìm thấy nhà cung cấp'),
      );
    });
  });
});
