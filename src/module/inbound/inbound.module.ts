import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { InboundController } from './inbound.controller';
import { InboundRepository } from './inbound.repository';
import { InboundService } from './inbound.service';

import { ProductModule } from '../product/product.module';

@Module({
  imports: [DatabaseModule, ProductModule],
  controllers: [InboundController],
  providers: [InboundService, InboundRepository, WarehouseRepository],
  exports: [InboundService, InboundRepository, WarehouseRepository],
})
export class InboundModule {}
