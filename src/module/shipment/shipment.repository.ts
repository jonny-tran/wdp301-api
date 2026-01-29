import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class ShipmentRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createShipment(
    orderId: string,
    fromWarehouseId: number,
    toWarehouseId: number,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const [shipment] = await database
      .insert(schema.shipments)
      .values({
        orderId,
        fromWarehouseId,
        toWarehouseId,
        status: 'preparing',
      })
      .returning();
    return shipment;
  }

  async createShipmentItems(
    items: {
      shipmentId: string;
      batchId: number;
      quantity: string;
    }[],
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    if (items.length === 0) return;
    await database.insert(schema.shipmentItems).values(items);
  }

  async getShipmentWithItems(shipmentId: string) {
    return this.db.query.shipments.findFirst({
      where: eq(schema.shipments.id, shipmentId),
      with: {
        items: {
          with: {
            batch: {
              with: {
                product: true,
              },
            },
          },
        },
        order: {
          with: {
            store: true,
          },
        },
      },
    });
  }
}
