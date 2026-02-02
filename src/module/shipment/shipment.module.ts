import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ClaimModule } from '../claim/claim.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShipmentController } from './shipment.controller';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService } from './shipment.service';

@Module({
  imports: [DatabaseModule, InventoryModule, forwardRef(() => ClaimModule)],
  controllers: [ShipmentController],
  providers: [ShipmentRepository, ShipmentService],
  exports: [ShipmentService, ShipmentRepository],
})
export class ShipmentModule {}
