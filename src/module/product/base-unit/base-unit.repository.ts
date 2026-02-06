import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import { CreateBaseUnitDto } from './dto/create-base-unit.dto';
import { UpdateBaseUnitDto } from './dto/update-base-unit.dto';

@Injectable()
export class BaseUnitRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: CreateBaseUnitDto) {
    const result = await this.db
      .insert(schema.baseUnits)
      .values(data)
      .returning();
    return result[0];
  }

  async findAll() {
    return await this.db.query.baseUnits.findMany({
      where: eq(schema.baseUnits.isActive, true),
      orderBy: [desc(schema.baseUnits.createdAt)],
    });
  }

  async findById(id: number) {
    return await this.db.query.baseUnits.findFirst({
      where: and(
        eq(schema.baseUnits.id, id),
        eq(schema.baseUnits.isActive, true),
      ),
    });
  }

  async findByName(name: string) {
    return await this.db.query.baseUnits.findFirst({
      where: eq(schema.baseUnits.name, name),
    });
  }

  async update(id: number, data: UpdateBaseUnitDto) {
    const result = await this.db
      .update(schema.baseUnits)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.baseUnits.id, id))
      .returning();
    return result[0];
  }

  async softDelete(id: number) {
    const result = await this.db
      .update(schema.baseUnits)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.baseUnits.id, id))
      .returning();
    return result[0];
  }
}
