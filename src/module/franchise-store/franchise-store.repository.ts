import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { USER_STATUS_PENDING } from './constants/franchise-staff.constants';

@Injectable()
export class FranchiseStoreRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly storeFilterMap: FilterMap<typeof schema.stores> = {
    search: { column: schema.stores.name, operator: 'ilike' },
    isActive: { column: schema.stores.isActive, operator: 'eq' },
  };

  async findAll(filter: GetStoresFilterDto) {
    return paginate(
      this.db,
      schema.stores,
      filter as PaginationParamsDto & Record<string, unknown>,
      this.storeFilterMap,
    );
  }

  async findById(id: string) {
    return this.db.query.stores.findFirst({
      where: eq(schema.stores.id, id),
      with: {
        warehouses: true,
      },
    });
  }

  async findByIdWithRoute(id: string) {
    return this.db.query.stores.findFirst({
      where: eq(schema.stores.id, id),
      with: {
        route: true,
        warehouses: true,
      },
    });
  }

  async create(dto: CreateStoreDto, tx?: NodePgDatabase<typeof schema>) {
    const db = tx ?? this.db;
    const inserted = await db
      .insert(schema.stores)
      .values({
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        managerName: dto.managerName,
      })
      .returning();
    return inserted[0];
  }

  async update(id: string, dto: UpdateStoreDto) {
    const [updated] = await this.db
      .update(schema.stores)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(schema.stores.id, id))
      .returning();
    return updated;
  }

  /*
  async softDelete(id: string) {
    // Schema doesn't have is_active for stores?
    // Let me check schema.ts from context.
    // Yes, schema.ts from context does NOT show is_active in stores table!
    // Wait, the franchiseStore_module_context.md says:
    // "Table stores: ... is_active: Boolean (Default: true)"
    // But the schema.ts file I read earlier:
    // export const stores = pgTable('stores', {
    //   id: uuid('id').defaultRandom().primaryKey(),
    //   name: text('name').notNull(),
    //   address: text('address').notNull(),
    //   managerName: text('manager_name'),
    //   phone: text('phone'),
    //   createdAt: timestamp('created_at').defaultNow(),
    //   updatedAt: timestamp('updated_at').defaultNow(),
    // });
    // IT IS MISSING is_active!
    // I need to add is_active to the schema first?
    // Or I should assume it's missing and I need to add it via a migration or just ignore it for now and use hard delete?
    // The instructions said "Soft Delete".
    // I should check if I can modify schema.ts. The plan said "Update Warehouse Entity/Schema if needed" but didn't explicitly check Stores.
    // I will DOUBLE CHECK schema.ts content.
  }
  */
  // API Get Data For Analytics
  // --- API 7: Store Reliability ---
  async getStoreReliability() {
    return this.db
      .select({
        storeId: schema.stores.id,
        storeName: schema.stores.name,
        totalShipments: sql<number>`CAST(count(DISTINCT ${schema.shipments.id}) AS FLOAT)`,
        totalClaims: sql<number>`CAST(count(DISTINCT ${schema.claims.id}) AS FLOAT)`,
        totalDamaged: sql<number>`CAST(SUM(COALESCE(${schema.claimItems.quantityDamaged}, 0)) AS FLOAT)`,
        totalMissing: sql<number>`CAST(SUM(COALESCE(${schema.claimItems.quantityMissing}, 0)) AS FLOAT)`,
      })
      .from(schema.stores)
      .leftJoin(schema.orders, eq(schema.stores.id, schema.orders.storeId))
      .leftJoin(
        schema.shipments,
        eq(schema.orders.id, schema.shipments.orderId),
      )
      .leftJoin(
        schema.claims,
        eq(schema.shipments.id, schema.claims.shipmentId),
      )
      .leftJoin(
        schema.claimItems,
        eq(schema.claims.id, schema.claimItems.claimId),
      )
      .groupBy(schema.stores.id, schema.stores.name);
  }

  // --- API 8: Demand Pattern ---
  async getDemandPattern(productId?: number) {
    const conditions: SQL[] = [];
    if (productId) conditions.push(eq(schema.orderItems.productId, productId));

    return this.db
      .select({
        dayOfWeek: sql<number>`CAST(EXTRACT(DOW FROM ${schema.orders.createdAt}) AS INTEGER)`,
        totalRequested: sql<number>`CAST(SUM(${schema.orderItems.quantityRequested}) AS FLOAT)`,
      })
      .from(schema.orders)
      .innerJoin(
        schema.orderItems,
        eq(schema.orders.id, schema.orderItems.orderId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`EXTRACT(DOW FROM ${schema.orders.createdAt})`);
  }

  async isEmailTaken(
    email: string,
    excludeUserId?: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<boolean> {
    const db = tx ?? this.db;
    const row = await db.query.users.findFirst({
      where: excludeUserId
        ? and(eq(schema.users.email, email), ne(schema.users.id, excludeUserId))
        : eq(schema.users.email, email),
    });
    return !!row;
  }

  async insertStaffUser(
    values: typeof schema.users.$inferInsert,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const db = tx ?? this.db;
    const inserted = await db.insert(schema.users).values(values).returning();
    return inserted[0]!;
  }

  async findUserById(
    id: string,
    tx?: NodePgDatabase<typeof schema>,
  ): Promise<typeof schema.users.$inferSelect | undefined> {
    const db = tx ?? this.db;
    return db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }

  async updateStaffUser(
    id: string,
    data: Partial<typeof schema.users.$inferInsert>,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const db = tx ?? this.db;
    const out = await db
      .update(schema.users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    return out[0];
  }

  async findPendingFranchiseStaff() {
    return this.db.query.users.findMany({
      where: and(
        eq(schema.users.role, 'franchise_store_staff'),
        eq(schema.users.status, USER_STATUS_PENDING),
      ),
      orderBy: (users, { desc }) => [desc(users.createdAt)],
      with: {
        store: true,
      },
    });
  }
}
