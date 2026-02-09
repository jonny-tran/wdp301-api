import { Module } from '@nestjs/common';
import { AuthModule } from 'src/module/auth/auth.module';
import { SupplierController } from './supplier.controller';
import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';

@Module({
  imports: [AuthModule],
  controllers: [SupplierController],
  providers: [SupplierService, SupplierRepository],
  exports: [SupplierService, SupplierRepository],
})
export class SupplierModule {}
