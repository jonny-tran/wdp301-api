import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BaseUnitController } from './base-unit/base-unit.controller';
import { BaseUnitRepository } from './base-unit/base-unit.repository';
import { BaseUnitService } from './base-unit/base-unit.service';
import { ProductController } from './product.controller';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductController, BaseUnitController],
  providers: [
    ProductService,
    ProductRepository,
    BaseUnitService,
    BaseUnitRepository,
  ],
  exports: [ProductService, ProductRepository, BaseUnitService],
})
export class ProductModule {}
