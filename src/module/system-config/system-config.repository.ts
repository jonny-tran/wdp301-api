import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';

@Injectable()
export class SystemConfigRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll() {
    return this.db.query.systemConfigs.findMany();
  }

  async findByKey(key: string) {
    return this.db.query.systemConfigs.findFirst({
      where: eq(schema.systemConfigs.key, key),
    });
  }

  async update(
    key: string,
    data: UpdateSystemConfigDto,
  ): Promise<typeof schema.systemConfigs.$inferSelect> {
    const result = await this.db
      .update(schema.systemConfigs)
      .set({
        value: data.value,
        description: data.description,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemConfigs.key, key))
      .returning();

    return result[0];
  }

  async createOrUpdate(
    key: string,
    data: UpdateSystemConfigDto,
  ): Promise<typeof schema.systemConfigs.$inferSelect> {
    const result = await this.db
      .insert(schema.systemConfigs)
      .values({
        key,
        value: data.value,
        description: data.description,
      })
      .onConflictDoUpdate({
        target: schema.systemConfigs.key,
        set: {
          value: data.value,
          description: data.description,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  }
}
