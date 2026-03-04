/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BaseUnitRepository } from './base-unit.repository';
import { BaseUnitService } from './base-unit.service';
import { CreateBaseUnitDto } from './dto/create-base-unit.dto';
import { UpdateBaseUnitDto } from './dto/update-base-unit.dto';

describe('BaseUnitService', () => {
  let service: BaseUnitService;
  let repo: jest.Mocked<BaseUnitRepository>;

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaseUnitService,
        {
          provide: BaseUnitRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<BaseUnitService>(BaseUnitService);
    repo = module.get(BaseUnitRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create a new base unit', async () => {
      const dto: CreateBaseUnitDto = { name: 'Thùng' };
      repo.findByName.mockResolvedValue(null as never);
      const expectedResult = { id: 1, name: 'Thùng', isActive: true };
      repo.create.mockResolvedValue(expectedResult as never);

      const result = await service.create(dto);

      expect(repo.findByName).toHaveBeenCalledWith('Thùng');
      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });

    it('should throw BadRequestException if name already exists', async () => {
      const dto: CreateBaseUnitDto = { name: 'Thùng' };
      repo.findByName.mockResolvedValue({
        id: 1,
        name: 'Thùng',
        isActive: true,
      } as never);

      await expect(service.create(dto)).rejects.toThrow(
        new BadRequestException('Tên đơn vị tính đã tồn tại'),
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated list of base units', async () => {
      const expectedResult = {
        items: [{ id: 1, name: 'Thùng', isActive: true }],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
      };

      const query = { page: 1, limit: 10 };
      repo.findAll.mockResolvedValue(expectedResult as never);

      const result = await service.findAll(query);

      expect(repo.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return a specific base unit by id', async () => {
      const expectedResult = { id: 1, name: 'Thùng', isActive: true };
      repo.findById.mockResolvedValue(expectedResult as never);

      const result = await service.findOne(1);

      expect(result).toEqual(expectedResult);
      expect(repo.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if base unit does not exist', async () => {
      repo.findById.mockResolvedValue(null as never);

      await expect(service.findOne(1)).rejects.toThrow(
        new NotFoundException(
          'Đơn vị tính không tồn tại hoặc đã bị ngừng sử dụng',
        ),
      );
    });
  });

  describe('update', () => {
    it('should successfully update base unit', async () => {
      const dto: UpdateBaseUnitDto = { name: 'Hộp' };
      const expectedResult = { id: 1, name: 'Hộp', isActive: true };

      repo.findById.mockResolvedValue({
        id: 1,
        name: 'Thùng',
        isActive: true,
      } as never);
      repo.findByName.mockResolvedValue(null as never);
      repo.update.mockResolvedValue(expectedResult as never);

      const result = await service.update(1, dto);

      expect(result).toEqual(expectedResult);
      expect(repo.update).toHaveBeenCalledWith(1, dto);
    });

    it('should throw NotFoundException if base unit does not exist', async () => {
      repo.findById.mockResolvedValue(null as never);

      await expect(service.update(1, { name: 'Hộp' })).rejects.toThrow(
        new NotFoundException('Đơn vị tính không tồn tại'),
      );
    });

    it('should throw BadRequestException if new name already exists in another record', async () => {
      repo.findById.mockResolvedValue({
        id: 1,
        name: 'Thùng',
        isActive: true,
      } as never);
      repo.findByName.mockResolvedValue({
        id: 2,
        name: 'Hộp',
        isActive: true,
      } as never);

      await expect(service.update(1, { name: 'Hộp' })).rejects.toThrow(
        new BadRequestException('Tên đơn vị tính đã tồn tại'),
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should logically delete a base unit', async () => {
      repo.findById.mockResolvedValue({
        id: 1,
        name: 'Thùng',
        isActive: true,
      } as never);
      repo.softDelete.mockResolvedValue({
        id: 1,
        name: 'Thùng',
        isActive: false,
      } as never);

      const result = await service.remove(1);

      expect(result.isActive).toBe(false);
      expect(repo.softDelete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if trying to remove non-existent unit', async () => {
      repo.findById.mockResolvedValue(null as never);

      await expect(service.remove(1)).rejects.toThrow(
        new NotFoundException('Đơn vị tính không tồn tại'),
      );
    });
  });
});
