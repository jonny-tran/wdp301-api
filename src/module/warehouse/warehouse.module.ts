import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { WarehouseRepository } from './warehouse.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseRepository],
  exports: [WarehouseService],
})
export class WarehouseModule {}
