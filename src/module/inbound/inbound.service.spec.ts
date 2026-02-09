import { Test, TestingModule } from '@nestjs/testing';
import { InboundService } from './inbound.service';

describe('InboundService', () => {
  let service: InboundService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InboundService],
    }).compile();

    service = module.get<InboundService>(InboundService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
