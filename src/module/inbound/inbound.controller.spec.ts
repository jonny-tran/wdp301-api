import { Test, TestingModule } from '@nestjs/testing';
import { InboundController } from './inbound.controller';
import { InboundService } from './inbound.service';

describe('InboundController', () => {
  let controller: InboundController;
  let inboundService: jest.Mocked<Partial<InboundService>>;

  beforeEach(async () => {
    inboundService = {
      createReceipt: jest.fn(),
      completeReceipt: jest.fn(),
      addReceiptItem: jest.fn(),
      getBatchLabel: jest.fn(),
      removeDraftReceipt: jest.fn(),
      deleteBatchItem: jest.fn(),
      reprintBatchLabel: jest.fn(),
      getAllReceipts: jest.fn(),
      getReceiptById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundController],
      providers: [{ provide: InboundService, useValue: inboundService }],
    }).compile();

    controller = module.get<InboundController>(InboundController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('removeDraftReceipt should delegate to service', async () => {
    inboundService.removeDraftReceipt!.mockResolvedValue({ message: 'Success' });
    await expect(
      controller.removeDraftReceipt('rid-1'),
    ).resolves.toEqual({ message: 'Success' });
    expect(inboundService.removeDraftReceipt).toHaveBeenCalledWith('rid-1');
  });
});
