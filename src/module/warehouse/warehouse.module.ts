import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [DatabaseModule, SystemConfigModule, InventoryModule],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseRepository],
  exports: [WarehouseService, WarehouseRepository],
})
export class WarehouseModule {}
