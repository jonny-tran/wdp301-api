import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { InboundController } from './inbound.controller';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';

@Module({
  imports: [DatabaseModule, SystemConfigModule, InventoryModule],
  controllers: [InboundController],
  providers: [InboundService, InboundRepository, WarehouseRepository],
  exports: [InboundService, InboundRepository, WarehouseRepository],
})
export class InboundModule {}
