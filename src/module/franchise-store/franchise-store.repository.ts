import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { PaginationParamsDto } from '../../common/dto/pagination-params.dto';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

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

  async create(dto: CreateStoreDto, tx?: NodePgDatabase<typeof schema>) {
    const db = tx ?? this.db;
    const [store] = await db
      .insert(schema.stores)
      .values({
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        managerName: dto.managerName,
      })
      .returning();
    return store;
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
}
