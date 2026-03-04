/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationParamsDto } from 'src/common/dto/pagination-params.dto';
import { BaseUnitController } from './base-unit.controller';
import { BaseUnitService } from './base-unit.service';
import { CreateBaseUnitDto } from './dto/create-base-unit.dto';
import { UpdateBaseUnitDto } from './dto/update-base-unit.dto';

describe('BaseUnitController', () => {
  let controller: BaseUnitController;
  let service: jest.Mocked<BaseUnitService>;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BaseUnitController],
      providers: [
        {
          provide: BaseUnitService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<BaseUnitController>(BaseUnitController);
    service = module.get(BaseUnitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a base unit', async () => {
      const dto: CreateBaseUnitDto = { name: 'Thùng' };
      const expectedResult = { id: 1, name: 'Thùng', isActive: true };
      service.create.mockResolvedValue(expectedResult as never);

      const result = await controller.create(dto);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return a list of base units with pagination metadata', async () => {
      const query: PaginationParamsDto = { page: 1, limit: 10 };
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

      service.findAll.mockResolvedValue(expectedResult as never);

      const result = await controller.findAll(query);

      expect(result).toEqual(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return a specific base unit by id', async () => {
      const expectedResult = { id: 1, name: 'Thùng', isActive: true };
      service.findOne.mockResolvedValue(expectedResult as never);

      const result = await controller.findOne(1);

      expect(result).toEqual(expectedResult);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a specific base unit', async () => {
      const dto: UpdateBaseUnitDto = { name: 'Hộp' };
      const expectedResult = { id: 1, name: 'Hộp', isActive: true };
      service.update.mockResolvedValue(expectedResult as never);

      const result = await controller.update(1, dto);

      expect(result).toEqual(expectedResult);
      expect(service.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('should logically delete a basic unit by updating isActive to false', async () => {
      const expectedResult = { id: 1, name: 'Thùng', isActive: false };
      service.remove.mockResolvedValue(expectedResult as never);

      const result = await controller.remove(1);

      expect(result).toEqual(expectedResult);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});
