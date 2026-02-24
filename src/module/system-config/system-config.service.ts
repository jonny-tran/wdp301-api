import { Injectable } from '@nestjs/common';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigRepository } from './system-config.repository';

@Injectable()
export class SystemConfigService {
  private configCache: Map<string, string> = new Map();

  constructor(
    private readonly systemConfigRepository: SystemConfigRepository,
  ) {}

  async onModuleInit() {
    await this.refreshCache();
  }

  async refreshCache() {
    const configs = await this.systemConfigRepository.findAll();
    this.configCache.clear();
    configs.forEach((config) => {
      this.configCache.set(config.key, config.value);
    });
  }

  async findAll() {
    return await this.systemConfigRepository.findAll();
  }

  async getConfigValue(key: string): Promise<string | null> {
    if (this.configCache.has(key)) {
      return this.configCache.get(key) || null;
    }
    const config = await this.systemConfigRepository.findByKey(key);
    if (config) {
      this.configCache.set(key, config.value);
      return config.value;
    }
    return null;
  }

  async updateConfig(key: string, data: UpdateSystemConfigDto) {
    const existingConfig = await this.systemConfigRepository.findByKey(key);

    const updatedConfig = existingConfig
      ? await this.systemConfigRepository.update(key, data)
      : await this.systemConfigRepository.createOrUpdate(key, data);

    this.configCache.set(key, updatedConfig.value);
    return updatedConfig;
  }
}
