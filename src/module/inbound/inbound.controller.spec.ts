import { Test, TestingModule } from '@nestjs/testing';
import { InboundController } from './inbound.controller';

describe('InboundController', () => {
  let controller: InboundController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundController],
    }).compile();

    controller = module.get<InboundController>(InboundController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
