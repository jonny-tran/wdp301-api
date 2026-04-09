import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionModule } from '../production/production.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [
    DatabaseModule,
    InventoryModule,
    ShipmentModule,
    SystemConfigModule,
    forwardRef(() => ProductionModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService, OrderRepository],
})
export class OrderModule {}
