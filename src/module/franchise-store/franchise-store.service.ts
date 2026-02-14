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
import { DemandPatternQueryDto } from './dto/analytics-query.dto';

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

  // --- API 7: Store Reliability ---
  async getStoreReliability() {
    const data = await this.franchiseStoreRepository.getStoreReliability();

    let totalSysShipments = 0;
    let totalSysClaims = 0;

    const storeStats = data.map((store) => {
      const shipments = store.totalShipments || 0;
      const claims = store.totalClaims || 0;

      totalSysShipments += shipments;
      totalSysClaims += claims;

      return {
        storeId: store.storeId,
        storeName: store.storeName,
        totalShipments: shipments,
        totalClaims: claims,
        claimRate: shipments > 0 ? claims / shipments : 0,
        totalDamagedQty: store.totalDamaged || 0,
        totalMissingQty: store.totalMissing || 0,
      };
    });

    const systemAvgClaimRate =
      totalSysShipments > 0 ? totalSysClaims / totalSysShipments : 0;

    // Fraud Detection: Báo động đỏ nếu tỷ lệ claim của cửa hàng > 1.5 lần trung bình hệ thống (và có >= 3 claims)
    const storeAnalysis = storeStats.map((store) => ({
      ...store,
      claimRatePercentage: parseFloat((store.claimRate * 100).toFixed(2)),
      isFraudWarning:
        store.claimRate > systemAvgClaimRate * 1.5 && store.totalClaims >= 3,
    }));

    // Sắp xếp: Ưu tiên cảnh báo gian lận lên đầu, sau đó theo tỷ lệ claim
    storeAnalysis.sort(
      (a, b) =>
        Number(b.isFraudWarning) - Number(a.isFraudWarning) ||
        b.claimRate - a.claimRate,
    );

    return {
      systemAverage: {
        totalShipments: totalSysShipments,
        totalClaims: totalSysClaims,
        averageClaimRatePercentage: parseFloat(
          (systemAvgClaimRate * 100).toFixed(2),
        ),
      },
      storeAnalysis,
    };
  }

  // --- API 8: Demand Pattern ---
  async getDemandPattern(query: DemandPatternQueryDto) {
    const data = await this.franchiseStoreRepository.getDemandPattern(
      query.productId,
    );

    // EXTRACT(DOW) trả về 0-6 (0 là Chủ nhật)
    const daysMap = [
      'Chủ Nhật',
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
    ];

    const pattern: number[] = Array.from({ length: 7 }, () => 0);

    data.forEach((row) => {
      if (row.dayOfWeek >= 0 && row.dayOfWeek <= 6) {
        pattern[row.dayOfWeek] = row.totalRequested || 0;
      }
    });

    return {
      productIdFilter: query.productId || 'All',
      demandByDay: daysMap.map((day, index) => ({
        dayOfWeek: day,
        totalRequestedQuantity: pattern[index],
      })),
    };
  }
}
