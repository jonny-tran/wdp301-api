import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { OrderModule } from '../order/order.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [
    DatabaseModule,
    SystemConfigModule,
    InventoryModule,
    LogisticsModule,
    forwardRef(() => OrderModule),
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseRepository],
  exports: [WarehouseService, WarehouseRepository],
})
export class WarehouseModule {}
