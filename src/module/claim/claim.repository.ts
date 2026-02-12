import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { ClaimStatus } from './constants/claim-status.enum';
import { GetClaimsDto } from './dto/get-claims.dto';

@Injectable()
export class ClaimRepository {
  private readonly claimStatusEnum = ClaimStatus;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly filterMap: FilterMap<typeof schema.claims> = {
    status: { column: schema.claims.status, operator: 'eq' },
    // storeId: { column: schema.claims.storeId, operator: 'eq' }, // Tạm thời disable vì bảng claims chưa có storeId
    search: { column: schema.claims.id, operator: 'ilike' },
    fromDate: { column: schema.claims.createdAt, operator: 'gte' },
    toDate: { column: schema.claims.createdAt, operator: 'lte' },
  };

  async findAll(query: GetClaimsDto) {
    return paginate(
      this.db,
      schema.claims,
      query as PaginationParamsDto & Record<string, unknown>,
      this.filterMap,
    );
  }

  async getShipmentForValidation(shipmentId: string) {
    return this.db.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
      columns: {
        id: true,
        status: true,
        updatedAt: true,
        toWarehouseId: true,
        orderId: true,
      },
      with: {
        order: {
          columns: {
            storeId: true,
          },
        },
      },
    });
  }

  async createClaim(
    shipmentId: string,
    createdBy: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const [claim] = await database
      .insert(schema.claims)
      .values({
        shipmentId,
        createdBy,
        status: this.claimStatusEnum.PENDING,
      })
      .returning();
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
  ) {
    const database = tx || this.db;
    const [updated] = await database
      .update(schema.claims)
      .set({
        status,
        resolvedAt: new Date(),
      })
      .where(eq(schema.claims.id, id))
      .returning();
    return updated;
  }
}
