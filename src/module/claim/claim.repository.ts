import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { eq, InferSelectModel, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { firstInsertedRow } from '../../common/drizzle/query-helpers';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { ClaimStatus } from './constants/claim-status.enum';
import { GetClaimsDto } from './dto/get-claims.dto';

type ClaimRow = InferSelectModel<typeof schema.claims>;

@Injectable()
export class ClaimRepository {
  private readonly claimStatusEnum = ClaimStatus;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly filterMap: FilterMap<typeof schema.claims> = {
    status: { column: schema.claims.status, operator: 'eq' },
    shipmentIds: { column: schema.claims.shipmentId, operator: 'in' },
    search: { column: schema.claims.id, operator: 'ilike' },
    fromDate: { column: schema.claims.createdAt, operator: 'gte' },
    toDate: { column: schema.claims.createdAt, operator: 'lte' },
  };

  async findAll(query: GetClaimsDto) {
    const filters: Record<string, unknown> = { ...query };
    const storeId = query.storeId;
    delete filters.storeId;

    if (query.fromDate) {
      filters.fromDate = new Date(query.fromDate);
    }

    if (query.toDate) {
      const endOfDay = new Date(query.toDate);
      endOfDay.setHours(23, 59, 59, 999);
      filters.toDate = endOfDay;
    }

    if (storeId) {
      const storeShipments = await this.db
        .select({ id: schema.shipments.id })
        .from(schema.shipments)
        .innerJoin(
          schema.orders,
          eq(schema.shipments.orderId, schema.orders.id),
        )
        .where(eq(schema.orders.storeId, storeId));

      const shipmentIds = storeShipments.map((s) => s.id);

      if (shipmentIds.length === 0) {
        return {
          items: [],
          meta: {
            totalItems: 0,
            itemCount: 0,
            itemsPerPage: Number(query.limit) || 0,
            totalPages: 0,
            currentPage: 1,
          },
        };
      }

      filters.shipmentIds = shipmentIds;
    }

    return paginate(
      this.db,
      schema.claims,
      filters as PaginationParamsDto & Record<string, unknown>,
      this.filterMap,
    );
  }

  async getShipmentForValidation(shipmentId: string) {
    return this.db.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
      with: {
        order: {
          columns: {
            storeId: true,
          },
        },
      },
    });
  }

  /** Tránh nested relation typing; dùng cho kiểm tra quyền cửa hàng. */
  async getOrderStoreIdByShipmentId(shipmentId: string) {
    const rows = await this.db
      .select({ storeId: schema.orders.storeId })
      .from(schema.shipments)
      .innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id))
      .where(eq(schema.shipments.id, shipmentId))
      .limit(1);
    return rows[0]?.storeId ?? null;
  }

  async createClaim(
    shipmentId: string,
    createdBy: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<ClaimRow> {
    const database = tx || this.db;
    const inserted = await database
      .insert(schema.claims)
      .values({
        shipmentId,
        createdBy,
        status: this.claimStatusEnum.PENDING,
      })
      .returning();
    const claim = firstInsertedRow<ClaimRow>(inserted);
    if (!claim) {
      throw new InternalServerErrorException('Không tạo được bản ghi claim');
    }
    return claim;
  }

  async createClaimItems(
    items: {
      claimId: string;
      productId: number;
      quantityMissing: number;
      quantityDamaged: number;
      reason?: string;
      imageUrl?: string;
    }[],
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    if (items.length === 0) return [];

    const claimItems = await database
      .insert(schema.claimItems)
      .values(
        items.map((item) => ({
          claimId: item.claimId,
          productId: item.productId,
          quantityMissing: item.quantityMissing.toString(),
          quantityDamaged: item.quantityDamaged.toString(),
          reason: item.reason,
          imageUrl: item.imageUrl,
        })),
      )
      .returning();
    return claimItems;
  }

  async getClaimById(id: string) {
    return this.db.query.claims.findFirst({
      where: eq(schema.claims.id, id),
      with: {
        shipment: {
          with: {
            order: {
              with: {
                store: true,
              },
            },
          },
        },
        items: {
          with: {
            product: true,
          },
        },
      },
    });
  }

  async updateClaimStatus(
    id: string,
    status: ClaimStatus.APPROVED | ClaimStatus.REJECTED,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<ClaimRow | undefined> {
    const database = tx || this.db;
    const inserted = await database
      .update(schema.claims)
      .set({
        status,
        resolvedAt: new Date(),
      })
      .where(eq(schema.claims.id, id))
      .returning();
    return firstInsertedRow<ClaimRow>(inserted);
  }

  // --- API : Analytics Discrepancy & Bottleneck ---
  async getDiscrepancyAnalytics(productId?: number) {
    // 1. Thống kê tổng hàng hóa đã được giao (Từ ShipmentItems)
    const shippedStatsQuery = this.db
      .select({
        productId: schema.batches.productId,
        productName: schema.products.name,
        totalShipped: sql<number>`CAST(SUM(${schema.shipmentItems.quantity}) AS FLOAT)`,
      })
      .from(schema.shipmentItems)
      .innerJoin(
        schema.batches,
        eq(schema.shipmentItems.batchId, schema.batches.id),
      )
      .innerJoin(
        schema.products,
        eq(schema.batches.productId, schema.products.id),
      )
      .where(productId ? eq(schema.batches.productId, productId) : undefined)
      .groupBy(schema.batches.productId, schema.products.name);

    // 2. Thống kê hàng lỗi hỏng / thất lạc (Từ ClaimItems)
    const claimsStatsQuery = this.db
      .select({
        productId: schema.claimItems.productId,
        productName: schema.products.name,
        totalDamaged: sql<number>`CAST(SUM(${schema.claimItems.quantityDamaged}) AS FLOAT)`,
        totalMissing: sql<number>`CAST(SUM(${schema.claimItems.quantityMissing}) AS FLOAT)`,
      })
      .from(schema.claimItems)
      .innerJoin(
        schema.products,
        eq(schema.claimItems.productId, schema.products.id),
      )
      .where(productId ? eq(schema.claimItems.productId, productId) : undefined)
      .groupBy(schema.claimItems.productId, schema.products.name);

    // 3. Đếm số lượng Shipment (Để tính Missing Rate % Shipment)
    const totalShipmentsRes = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.shipments);
    const shipmentsWithMissingRes = await this.db
      .select({
        count: sql<number>`count(DISTINCT ${schema.claims.shipmentId})`,
      })
      .from(schema.claims)
      .innerJoin(
        schema.claimItems,
        eq(schema.claims.id, schema.claimItems.claimId),
      )
      .where(sql`${schema.claimItems.quantityMissing} > 0`);

    const [shippedStats, claimsStats] = await Promise.all([
      shippedStatsQuery,
      claimsStatsQuery,
    ]);

    return {
      shippedStats,
      claimsStats,
      totalShipments: Number(totalShipmentsRes[0].count),
      shipmentsWithMissing: Number(shipmentsWithMissingRes[0].count),
    };
  }
}
