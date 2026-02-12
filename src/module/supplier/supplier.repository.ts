import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { FilterMap, paginate } from '../../common/utils/paginate.util';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { GetSuppliersDto } from './dto/get-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SupplierRepository {
  private readonly supplierFilterMap: FilterMap<typeof schema.suppliers> = {
    search: { column: schema.suppliers.name, operator: 'ilike' },
    isActive: { column: schema.suppliers.isActive, operator: 'eq' },
  };

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(createSupplierDto: CreateSupplierDto) {
    const [supplier] = await this.db
      .insert(schema.suppliers)
      .values(createSupplierDto)
      .returning();
    return supplier;
  }

  async findAll(query: GetSuppliersDto) {
    return paginate(
      this.db as any,
      schema.suppliers,
      query as any,
      this.supplierFilterMap as any,
    );
  }

  async findById(id: number) {
    return this.db.query.suppliers.findFirst({
      where: eq(schema.suppliers.id, id),
      with: {
        receipts: {
          orderBy: desc(schema.receipts.createdAt),
          limit: 5,
        },
      },
    });
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto) {
    const [supplier] = await this.db
      .update(schema.suppliers)
      .set(updateSupplierDto)
      .where(eq(schema.suppliers.id, id))
      .returning();
    return supplier;
  }

  async softDelete(id: number) {
    const [supplier] = await this.db
      .update(schema.suppliers)
      .set({ isActive: false })
      .where(eq(schema.suppliers.id, id))
      .returning();
    return supplier;
  }
}
