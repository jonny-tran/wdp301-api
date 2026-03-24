import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InboundModule } from '../inbound/inbound.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductModule } from '../product/product.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { ProductionController } from './production.controller';
import { ProductionRepository } from './production.repository';
import { ProductionService } from './production.service';

@Module({
  imports: [
    DatabaseModule,
    InboundModule,
    InventoryModule,
    ProductModule,
    WarehouseModule,
  ],
  controllers: [ProductionController],
  providers: [ProductionService, ProductionRepository],
  exports: [ProductionService],
})
export class ProductionModule {}
