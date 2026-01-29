import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [DatabaseModule, ShipmentModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
})
export class OrderModule {}
