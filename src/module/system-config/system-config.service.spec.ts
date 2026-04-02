import { Test, TestingModule } from '@nestjs/testing';
import { SystemConfigRepository } from './system-config.repository';
import { SystemConfigService } from './system-config.service';

describe('SystemConfigService', () => {
  let service: SystemConfigService;

  const mockRepository = {
    findAll: jest.fn().mockResolvedValue([]),
    findByKey: jest.fn(),
    update: jest.fn(),
    createOrUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigService,
        {
          provide: SystemConfigRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SystemConfigService>(SystemConfigService);

    // Clear mocks before each test
    jest.clearAllMocks();
  });

  describe('getValues', () => {
    it('should return values from cache when keys are cached', async () => {
      mockRepository.findAll.mockResolvedValue([
        { key: 'A', value: '1' },
        { key: 'B', value: '2' },
      ] as never[]);

      const fresh = new SystemConfigService(
        mockRepository as unknown as SystemConfigRepository,
      );
      await fresh.refreshCache();

      const result = await fresh.getValues(['A', 'B']);
      expect(result).toEqual({ A: '1', B: '2' });
      expect(mockRepository.findByKey).not.toHaveBeenCalled();
    });

    it('should fetch missing keys from repository', async () => {
      mockRepository.findByKey.mockImplementation(async (key: string) => {
        if (key === 'X') return { key: 'X', value: '99' };
        return null;
      });

      const result = await service.getValues(['X', 'Y']);

      expect(result.X).toBe('99');
      expect(result.Y).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should create new config if it does not exist', async () => {
      mockRepository.findByKey.mockResolvedValue(null);
      mockRepository.createOrUpdate.mockResolvedValue({
        key: 'TEST_KEY',
        value: '10',
      });

      const result = await service.updateConfig('TEST_KEY', { value: '10' });

      expect(mockRepository.findByKey).toHaveBeenCalledWith('TEST_KEY');
      expect(mockRepository.createOrUpdate).toHaveBeenCalledWith('TEST_KEY', {
        value: '10',
      });
      expect(result).toEqual({ key: 'TEST_KEY', value: '10' });
    });

    it('should update existing config', async () => {
      mockRepository.findByKey.mockResolvedValue({
        key: 'TEST_KEY',
        value: '5',
      });
      mockRepository.update.mockResolvedValue({ key: 'TEST_KEY', value: '20' });

      const result = await service.updateConfig('TEST_KEY', { value: '20' });

      expect(mockRepository.findByKey).toHaveBeenCalledWith('TEST_KEY');
      expect(mockRepository.update).toHaveBeenCalledWith('TEST_KEY', {
        value: '20',
      });
      expect(result).toEqual({ key: 'TEST_KEY', value: '20' });
    });
  });
});
