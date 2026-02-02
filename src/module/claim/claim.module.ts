import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { ClaimController } from './claim.controller';
import { ClaimRepository } from './claim.repository';
import { ClaimService } from './claim.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => ShipmentModule)],
  controllers: [ClaimController],
  providers: [ClaimService, ClaimRepository],
  exports: [ClaimService, ClaimRepository],
})
export class ClaimModule {}
