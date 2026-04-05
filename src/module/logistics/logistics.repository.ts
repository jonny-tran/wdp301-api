import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import * as schema from '../../database/schema';

@Injectable()
export class LogisticsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // --- Vehicles ---

  async findAllVehicles() {
    return this.db.query.vehicles.findMany({
      orderBy: [asc(schema.vehicles.id)],
    });
  }

  async findVehicleById(id: number) {
    return this.db.query.vehicles.findFirst({
      where: eq(schema.vehicles.id, id),
    });
  }

  async createVehicle(values: typeof schema.vehicles.$inferInsert) {
    const [row] = await this.db
      .insert(schema.vehicles)
      .values(values)
      .returning();
    return row;
  }

  async updateVehicle(
    id: number,
    values: Partial<typeof schema.vehicles.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(schema.vehicles)
      .set(values)
      .where(eq(schema.vehicles.id, id))
      .returning();
    return row;
  }

  async deleteVehicle(id: number) {
    const [row] = await this.db
      .delete(schema.vehicles)
      .where(eq(schema.vehicles.id, id))
      .returning();
    return row;
  }

  // --- Routes ---

  async findAllRoutes() {
    return this.db.query.routes.findMany({
      orderBy: [asc(schema.routes.id)],
    });
  }

  async findRouteById(id: number) {
    return this.db.query.routes.findFirst({
      where: eq(schema.routes.id, id),
    });
  }

  async createRoute(values: typeof schema.routes.$inferInsert) {
    const [row] = await this.db
      .insert(schema.routes)
      .values(values)
      .returning();
    return row;
  }

  async updateRoute(
    id: number,
    values: Partial<typeof schema.routes.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(schema.routes)
      .set(values)
      .where(eq(schema.routes.id, id))
      .returning();
    return row;
  }

  async deleteRoute(id: number) {
    const [row] = await this.db
      .delete(schema.routes)
      .where(eq(schema.routes.id, id))
      .returning();
    return row;
  }
}
