import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { WarehouseService } from '../warehouse/warehouse.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { FranchiseStoreRepository } from './franchise-store.repository';

@Injectable()
export class FranchiseStoreService {
  constructor(
    private readonly franchiseStoreRepository: FranchiseStoreRepository,
    private readonly warehouseService: WarehouseService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createStore(dto: CreateStoreDto) {
    return this.db.transaction(async (tx) => {
      // 1. Create Store
      const store = await this.franchiseStoreRepository.create(dto, tx);

      if (!store) {
        throw new InternalServerErrorException('Lỗi không thể tạo store');
      }

      // 2. Create Default Warehouse (Linked to Store)
      await this.warehouseService.createDefaultWarehouse(
        store.id,
        store.name,
        tx,
      );

      return store;
    });
  }

  async findAll(filter: GetStoresFilterDto) {
    if (filter.isActive === undefined) {
      filter.isActive = true;
    }
    return this.franchiseStoreRepository.findAll(filter);
  }

  async findOne(id: string) {
    const store = await this.franchiseStoreRepository.findById(id);
    if (!store) {
      throw new NotFoundException('Không tìm thấy cửa hàng');
    }
    if (!store.isActive) {
      throw new BadRequestException('Store đã không còn hoạt động');
    }
    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    const store = await this.franchiseStoreRepository.findById(id);
    if (!store) {
      throw new NotFoundException('Không tìm thấy cửa hàng');
    }
    if (!store.isActive) {
      throw new BadRequestException('Store đã không còn hoạt động');
    }
    return this.franchiseStoreRepository.update(id, dto);
  }

  async remove(id: string) {
    return this.franchiseStoreRepository.update(id, { isActive: false });
  }
}
