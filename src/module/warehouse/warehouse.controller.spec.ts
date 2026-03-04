import { Test, TestingModule } from '@nestjs/testing';
import { FinalizeBulkShipmentDto } from './dto/finalize-bulk-shipment.dto';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

describe('WarehouseController', () => {
  let controller: WarehouseController;
  let warehouseService: jest.Mocked<Partial<WarehouseService>>;

  beforeEach(async () => {
    warehouseService = {
      getCentralWarehouseId: jest.fn(),
      getTasks: jest.fn(),
      getPickingList: jest.fn(),
      resetPickingTask: jest.fn(),
      finalizeBulkShipment: jest.fn(),
      getShipmentLabel: jest.fn(),
      scanBatchCheck: jest.fn(),
      reportIssue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehouseController],
      providers: [{ provide: WarehouseService, useValue: warehouseService }],
    }).compile();

    controller = module.get<WarehouseController>(WarehouseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('finalizeBulkShipment', () => {
    it('should call finalizeBulkShipment from service', async () => {
      // Arrange
      const dto: FinalizeBulkShipmentDto = { orders: [] };
      (warehouseService.getCentralWarehouseId as jest.Mock).mockResolvedValue(
        1,
      );
      (warehouseService.finalizeBulkShipment as jest.Mock).mockResolvedValue({
        message: 'Success',
      });

      // Act
      const result = await controller.finalizeBulkShipment(dto);

      // Assert
      expect(warehouseService.getCentralWarehouseId).toHaveBeenCalled();
      expect(warehouseService.finalizeBulkShipment).toHaveBeenCalledWith(
        1,
        dto,
      );
      expect(result).toEqual({ message: 'Success' });
    });
  });
});
