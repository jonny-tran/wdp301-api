import { randomUUID } from 'crypto';

import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { WarehouseService } from '../warehouse/warehouse.service';
import {
  FRANCHISE_STAFF_DEFAULT_PASSWORD,
  USER_STATUS_ACTIVE,
  USER_STATUS_PENDING,
  USER_STATUS_REJECTED,
} from './constants/franchise-staff.constants';
import { DemandPatternQueryDto } from './dto/analytics-query.dto';
import { CreateStaffRequestsDto } from './dto/create-staff-request.dto';
import { RejectStaffDto } from './dto/reject-staff.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { FranchiseStoreRepository } from './franchise-store.repository';
import { pickUniqueStaffEmail } from './utils/name-generator.util';

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
      throw new BadRequestException('Cửa hàng đã không còn hoạt động');
    }
    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    const store = await this.franchiseStoreRepository.findById(id);
    if (!store) {
      throw new NotFoundException('Không tìm thấy cửa hàng');
    }
    if (!store.isActive) {
      throw new BadRequestException('Cửa hàng đã không còn hoạt động');
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

  async createStaffRequestsBatch(dto: CreateStaffRequestsDto) {
    const uniqueStoreIds = [...new Set(dto.staff.map((s) => s.storeId))];
    for (const storeId of uniqueStoreIds) {
      const store = await this.franchiseStoreRepository.findById(storeId);
      if (!store) {
        throw new BadRequestException(`Cửa hàng không tồn tại (${storeId})`);
      }
      if (!store.isActive) {
        throw new BadRequestException(
          `Cửa hàng "${store.name}" không còn hoạt động`,
        );
      }
    }

    return this.db.transaction(async (tx) => {
      const created: Array<{
        id: string;
        username: string;
        phone: string | null;
        storeId: string | null;
        status: string;
        role: string;
        staffRequestNote: string | null;
        createdAt: Date | null;
      }> = [];

      for (const item of dto.staff) {
        let passwordHash: string;
        try {
          passwordHash = await argon2.hash(randomUUID());
        } catch {
          throw new InternalServerErrorException('Lỗi mã hóa mật khẩu tạm');
        }

        const user = await this.franchiseStoreRepository.insertStaffUser(
          {
            username: item.fullName,
            email: `pending.${randomUUID()}@pending.staff.wdp`,
            passwordHash,
            phone: item.phone,
            staffRequestNote: item.note?.length ? item.note : null,
            role: 'franchise_store_staff',
            storeId: item.storeId,
            status: USER_STATUS_PENDING,
          },
          tx,
        );

        created.push({
          id: user.id,
          username: user.username,
          phone: user.phone,
          storeId: user.storeId,
          status: user.status,
          role: user.role,
          staffRequestNote: user.staffRequestNote ?? null,
          createdAt: user.createdAt ?? null,
        });
      }

      return { created, count: created.length };
    });
  }

  findPendingStaffRequests() {
    return this.franchiseStoreRepository.findPendingFranchiseStaff();
  }

  async rejectStaff(staffId: string, dto: RejectStaffDto) {
    const user = await this.franchiseStoreRepository.findUserById(staffId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }
    if (user.role !== 'franchise_store_staff') {
      throw new BadRequestException('Người dùng không phải nhân viên cửa hàng');
    }
    if (user.status !== USER_STATUS_PENDING) {
      throw new ConflictException('Nhân viên không ở trạng thái chờ duyệt');
    }

    const reason = dto.reason?.trim();
    const updated = await this.franchiseStoreRepository.updateStaffUser(staffId, {
      status: USER_STATUS_REJECTED,
      staffRejectionReason: reason?.length ? reason : null,
    });

    if (!updated) {
      throw new InternalServerErrorException('Cập nhật nhân viên thất bại');
    }

    return {
      id: updated.id,
      username: updated.username,
      status: updated.status,
      staffRejectionReason: updated.staffRejectionReason,
    };
  }

  async approveStaff(staffId: string) {
    return this.db.transaction(async (tx) => {
      const user = await this.franchiseStoreRepository.findUserById(
        staffId,
        tx,
      );
      if (!user) {
        throw new NotFoundException('Không tìm thấy nhân viên');
      }
      if (user.role !== 'franchise_store_staff') {
        throw new BadRequestException('Người dùng không phải nhân viên cửa hàng');
      }
      if (user.status !== USER_STATUS_PENDING) {
        throw new ConflictException('Nhân viên không ở trạng thái chờ duyệt');
      }

      let picked: { email: string };
      try {
        picked = await pickUniqueStaffEmail(
          user.username,
          (email) => this.franchiseStoreRepository.isEmailTaken(email, staffId, tx),
        );
      } catch {
        throw new ConflictException(
          'Không thể sinh email duy nhất (đã thử hết hậu tố 1–100)',
        );
      }

      let passwordHash: string;
      try {
        passwordHash = await argon2.hash(FRANCHISE_STAFF_DEFAULT_PASSWORD);
      } catch {
        throw new InternalServerErrorException('Lỗi mã hóa mật khẩu');
      }

      const updated = await this.franchiseStoreRepository.updateStaffUser(
        staffId,
        {
          email: picked.email,
          passwordHash,
          status: USER_STATUS_ACTIVE,
        },
        tx,
      );

      if (!updated) {
        throw new InternalServerErrorException('Cập nhật nhân viên thất bại');
      }

      return {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        phone: updated.phone,
        storeId: updated.storeId,
        role: updated.role,
        status: updated.status,
        temporaryPassword: FRANCHISE_STAFF_DEFAULT_PASSWORD,
      };
    });
  }
}
