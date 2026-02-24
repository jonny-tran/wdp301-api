import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [DatabaseModule, ShipmentModule, SystemConfigModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
})
export class OrderModule {}
