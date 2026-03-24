import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema });

async function main() {
  console.log('🚀 Starting Incremental Seed for FEFO Testing...');

  // 1. Tìm hoặc Tạo Kho Bếp (Central Kitchen)
  let centralWarehouse = await db.query.warehouses.findFirst({
    where: eq(schema.warehouses.type, 'central'),
  });

  if (!centralWarehouse) {
    console.log('Warning: Central Warehouse not found. Creating new one...');
    [centralWarehouse] = await db
      .insert(schema.warehouses)
      .values({
        name: 'Central Kitchen (Auto-Gen)',
        type: 'central',
      })
      .returning();
  }
  console.log(
    `✅ Using Warehouse: ${centralWarehouse.name} (ID: ${centralWarehouse.id})`,
  );

  // 2.A Find or Create Base Unit
  const baseUnitName = 'kg';
  let baseUnit = await db.query.baseUnits.findFirst({
    where: eq(schema.baseUnits.name, baseUnitName),
  });

  if (!baseUnit) {
    console.log('Creating Base Unit...');
    [baseUnit] = await db
      .insert(schema.baseUnits)
      .values({
        name: baseUnitName,
        description: 'Kilogram',
      })
      .returning();
  }
  console.log(`✅ Using Base Unit: ${baseUnit.name} (ID: ${baseUnit.id})`);

  // 2.B Tìm hoặc Tạo Sản Phẩm Test (Cánh gà)
  const productSku = 'CK-WINGS-TEST';
  let product = await db.query.products.findFirst({
    where: eq(schema.products.sku, productSku),
  });

  if (!product) {
    console.log('Creating Test Product...');
    [product] = await db
      .insert(schema.products)
      .values({
        sku: productSku,
        name: 'Cánh gà Test FEFO',
        baseUnitId: baseUnit.id,
        shelfLifeDays: 7,
        isActive: true,
      })
      .returning();
  }
  console.log(`✅ Using Product: ${product.name} (ID: ${product.id})`);

  // 3. Tạo Lô hàng (Batches) - LUÔN TẠO MỚI với suffix để tránh trùng
  const uniqueSuffix = Date.now();

  console.log('Creating Test Batches...');

  // Batch A: Hết hạn ngày 01/02/2026 (Cũ hơn - Cần xuất trước)
  const [batchOld] = await db
    .insert(schema.batches)
    .values({
      batchCode: `BATCH_OLD_${uniqueSuffix}`,
      productId: product.id,
      manufacturedDate: '2026-01-20',
      expiryDate: '2026-02-01',
    })
    .returning();

  // Batch B: Hết hạn ngày 15/02/2026 (Mới hơn - Xuất sau)
  const [batchNew] = await db
    .insert(schema.batches)
    .values({
      batchCode: `BATCH_NEW_${uniqueSuffix}`,
      productId: product.id,
      manufacturedDate: '2026-02-01',
      expiryDate: '2026-02-15',
    })
    .returning();

  // 4. Nhập kho (Insert Inventory)
  await db.insert(schema.inventory).values([
    {
      warehouseId: centralWarehouse.id,
      batchId: batchOld.id,
      quantity: '50.00',
      reservedQuantity: '0.00',
    },
    {
      warehouseId: centralWarehouse.id,
      batchId: batchNew.id,
      quantity: '100.00',
      reservedQuantity: '0.00',
    },
  ]);

  console.log('🎉 Seed Added Successfully!');
  console.log('------------------------------------------------');
  console.log(`👉 Warehouse ID: ${centralWarehouse.id}`);
  console.log(`👉 Product ID:   ${product.id}`);
  console.log(
    `👉 Batch Old:    ${batchOld.batchCode} (Exp: 2026-02-01) - Qty: 50`,
  );
  console.log(
    `👉 Batch New:    ${batchNew.batchCode} (Exp: 2026-02-15) - Qty: 100`,
  );
  console.log('------------------------------------------------');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
