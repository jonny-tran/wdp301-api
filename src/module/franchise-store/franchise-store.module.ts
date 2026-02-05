import { Module } from '@nestjs/common';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { FranchiseStoreController } from './franchise-store.controller';
import { FranchiseStoreRepository } from './franchise-store.repository';
import { FranchiseStoreService } from './franchise-store.service';

@Module({
  imports: [WarehouseModule],
  controllers: [FranchiseStoreController],
  providers: [FranchiseStoreService, FranchiseStoreRepository],
  exports: [FranchiseStoreService],
})
export class FranchiseStoreModule {}
