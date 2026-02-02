import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { ClaimStatus } from './constants/claim-status.enum';

@Injectable()
export class ClaimRepository {
  private readonly claimStatusEnum = ClaimStatus;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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

  async getClaimsByStoreId(storeId: string) {
    // We need to join through shipment -> toWarehouse -> store
    const claims = await this.db.query.claims.findMany({
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

    // Filter claims where the shipment's destination store matches
    return claims.filter((claim) => claim.shipment.order.store.id === storeId);
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
