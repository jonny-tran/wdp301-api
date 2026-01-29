import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ShipmentController } from './shipment.controller';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService } from './shipment.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ShipmentController],
  providers: [ShipmentRepository, ShipmentService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
