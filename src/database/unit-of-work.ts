import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from './database.constants';
import * as schema from './schema';

@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // Phương thức chạy một đơn vị công việc trong transaction
  async runInTransaction<T>(
    work: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return await this.db.transaction(work);
  }
}
