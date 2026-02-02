import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from './constants/shipment-status.enum';

@Injectable()
export class ShipmentRepository {
  private readonly shipmentStatusEnum = ShipmentStatus;
  private readonly orderStatusEnum = OrderStatus;

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
        status: this.shipmentStatusEnum.PREPARING,
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

  async findIncomingShipments(toWarehouseId: number) {
    return this.db.query.shipments.findMany({
      where: (shipments) =>
        and(
          eq(shipments.toWarehouseId, toWarehouseId),
          eq(shipments.status, this.shipmentStatusEnum.IN_TRANSIT),
        ),
      with: {
        order: {
          with: {
            store: true,
          },
        },
      },
      orderBy: (shipments, { desc }) => [desc(shipments.createdAt)],
    });
  }

  async getShipmentById(shipmentId: string) {
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

  async updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const [updated] = await database
      .update(schema.shipments)
      .set({ status })
      .where(eq(schema.shipments.id, shipmentId))
      .returning();
    return updated;
  }

  async findWarehouseById(id: number, tx?: NodePgDatabase<typeof schema>) {
    const database = tx || this.db;
    return database.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, id),
    });
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus.COMPLETED | OrderStatus.CLAIMED,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const database = tx || this.db;
    const [updated] = await database
      .update(schema.orders)
      .set({ status })
      .where(eq(schema.orders.id, orderId))
      .returning();
    return updated;
  }
}
