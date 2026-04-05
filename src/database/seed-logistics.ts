import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Seed xe và tuyến mẫu phục vụ test Consolidation / manifest.
 * Chạy: npm run db:seed:logistics
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL chưa được khai báo');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  console.log('🚚 Seeding logistics (vehicles + routes)...');

  const vehicleSeeds = [
    {
      licensePlate: '51K-500KG',
      payloadCapacity: '500',
      fuelRatePerKm: '0.18',
      status: 'available' as const,
      label: 'Xe tải 500kg',
    },
    {
      licensePlate: '51K-1TAN',
      payloadCapacity: '1000',
      fuelRatePerKm: '0.22',
      status: 'available' as const,
      label: 'Xe tải 1 tấn',
    },
    {
      licensePlate: '51K-15TAN',
      payloadCapacity: '1500',
      fuelRatePerKm: '0.25',
      status: 'available' as const,
      label: 'Xe tải 1.5 tấn (dự phòng)',
    },
  ];

  for (const v of vehicleSeeds) {
    const existing = await db.query.vehicles.findFirst({
      where: eq(schema.vehicles.licensePlate, v.licensePlate),
    });
    if (existing) {
      console.log(`  ⏭ Bỏ qua xe đã có: ${v.licensePlate} (${v.label})`);
      continue;
    }
    await db.insert(schema.vehicles).values({
      licensePlate: v.licensePlate,
      payloadCapacity: v.payloadCapacity,
      fuelRatePerKm: v.fuelRatePerKm,
      status: v.status,
    });
    console.log(`  ✅ Tạo xe: ${v.licensePlate} — ${v.label}`);
  }

  const routeSeeds = [
    {
      routeName: 'Hub Trung tâm → Quận 1 (nội thành)',
      distanceKm: '12.5',
      estimatedHours: '1.25',
      baseTransportCost: '280000',
    },
    {
      routeName: 'Hub Trung tâm → Thủ Đức / TP Thủ Đức',
      distanceKm: '22',
      estimatedHours: '2',
      baseTransportCost: '420000',
    },
    {
      routeName: 'Hub Trung tâm → Biên Hòa (Đồng Nai)',
      distanceKm: '35',
      estimatedHours: '3.5',
      baseTransportCost: '650000',
    },
    {
      routeName: 'Hub Trung tâm → Bình Dương (TP mới)',
      distanceKm: '28',
      estimatedHours: '2.75',
      baseTransportCost: '520000',
    },
  ];

  for (const r of routeSeeds) {
    const existing = await db.query.routes.findFirst({
      where: eq(schema.routes.routeName, r.routeName),
    });
    if (existing) {
      console.log(`  ⏭ Bỏ qua tuyến đã có: ${r.routeName}`);
      continue;
    }
    await db.insert(schema.routes).values({
      routeName: r.routeName,
      distanceKm: r.distanceKm,
      estimatedHours: r.estimatedHours,
      baseTransportCost: r.baseTransportCost,
    });
    console.log(`  ✅ Tạo tuyến: ${r.routeName}`);
  }

  await pool.end();
  console.log('🎉 Hoàn tất seed logistics.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
