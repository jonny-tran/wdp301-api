import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import { receipts, suppliers } from 'src/database/schema';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SupplierRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof import('src/database/schema')>,
  ) {}

  async create(createSupplierDto: CreateSupplierDto) {
    const [supplier] = await this.db
      .insert(suppliers)
      .values(createSupplierDto)
      .returning();
    return supplier;
  }

  async findAll(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    const whereCondition = search
      ? and(
          eq(suppliers.isActive, true),
          or(
            ilike(suppliers.name, `%${search}%`),
            ilike(suppliers.phone, `%${search}%`),
          ),
        )
      : eq(suppliers.isActive, true);

    const data = await this.db
      .select()
      .from(suppliers)
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(suppliers.createdAt));

    const totalResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(whereCondition);

    return {
      data,
      total: Number(totalResult[0]?.count || 0),
    };
  }

  async findById(id: number) {
    return this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, id),
      with: {
        receipts: {
          orderBy: desc(receipts.createdAt),
          limit: 5,
        },
      },
    });
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto) {
    const [supplier] = await this.db
      .update(suppliers)
      .set(updateSupplierDto)
      .where(eq(suppliers.id, id))
      .returning();
    return supplier;
  }

  async softDelete(id: number) {
    const [supplier] = await this.db
      .update(suppliers)
      .set({ isActive: false })
      .where(eq(suppliers.id, id))
      .returning();
    return supplier;
  }
}
