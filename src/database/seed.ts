import * as argon2 from 'argon2';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const runSeed = async () => {
  console.log('🌱 Starting seeding process...');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({ connectionString, ssl: true });
  const db = drizzle(pool, { schema });

  try {
    const rawPassword = process.env.SEED_PASSWORD;
    if (!rawPassword) {
      throw new Error('SEED_PASSWORD is not defined');
    }
    const hashedPassword = await argon2.hash(rawPassword);

    console.log(`🔐 Password hashed with Argon2.`);

    console.log('🧹 Cleaning old data...');
    await db.delete(schema.users);
    await db.delete(schema.stores);

    console.log('🏪 Creating dummy store...');
    const [demoStore] = await db
      .insert(schema.stores)
      .values({
        name: 'KFC Franchise - District 1',
        address: '123 Nguyen Hue, Ben Nghe, District 1, HCMC',
        phone: '0909123456',
        managerName: 'Nguyen Van Quan Ly',
      })
      .returning();

    console.log('👤 Creating users...');

    const usersToCreate = [
      {
        username: 'admin',
        email: 'admin@gmail.com',
        role: 'admin' as const,
        storeId: null,
      },
      {
        username: 'manager',
        email: 'manager@gmail.com',
        role: 'manager' as const,
        storeId: null,
      },
      {
        username: 'coordinator',
        email: 'coordinator@gmail.com',
        role: 'supply_coordinator' as const,
        storeId: null,
      },
      {
        username: 'chef',
        email: 'kitchen@gmail.com',
        role: 'central_kitchen_staff' as const,
        storeId: null,
      },
      {
        username: 'staff',
        email: 'staff@gmail.com',
        role: 'franchise_store_staff' as const,
        storeId: demoStore.id,
      },
    ];

    for (const u of usersToCreate) {
      await db.insert(schema.users).values({
        username: u.username,
        email: u.email,
        passwordHash: hashedPassword,
        role: u.role,
        storeId: u.storeId,
        status: 'active',
      });
      console.log(`   + Created: [${u.role.toUpperCase()}] ${u.email}`);
    }

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await pool.end();
  }
};

void runSeed();
