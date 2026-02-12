import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from './constants/shipment-status.enum';
import { GetShipmentsDto } from './dto/get-shipments.dto';

@Injectable()
export class ShipmentRepository {
  private readonly shipmentStatusEnum = ShipmentStatus;
  private readonly orderStatusEnum = OrderStatus;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(query: GetShipmentsDto) {
    const {
      page = 1,
      limit = 10,
      status,
      storeId,
      search,
      fromDate,
      toDate,
    } = query;
    const offset = (page - 1) * limit;

    const whereConditions: SQL[] = [];

    if (status) {
      whereConditions.push(eq(schema.shipments.status, status));
    }

    if (storeId) {
      whereConditions.push(eq(schema.orders.storeId, storeId));
    }

    if (search) {
      const searchCondition = or(
        ilike(sql`${schema.shipments.id}::text`, `%${search}%`),
        ilike(sql`${schema.orders.id}::text`, `%${search}%`),
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    if (fromDate) {
      whereConditions.push(gte(schema.shipments.createdAt, new Date(fromDate)));
    }

    if (toDate) {
      whereConditions.push(lte(schema.shipments.createdAt, new Date(toDate)));
    }

    const data = await this.db
      .select({
        id: schema.shipments.id,
        orderId: schema.shipments.orderId,
        storeName: schema.stores.name,
        status: schema.shipments.status,
        shipDate: schema.shipments.shipDate,
        createdAt: schema.shipments.createdAt,
      })
      .from(schema.shipments)
      .innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id))
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(whereConditions.length ? and(...whereConditions) : undefined)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.shipments.createdAt));

    const totalResult = await this.db
      .select({ count: count() })
      .from(schema.shipments)
      .innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id))
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(whereConditions.length ? and(...whereConditions) : undefined);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items: data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

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
