import * as argon2 from 'argon2';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

const runSeed = async () => {
  console.log('🌱 Bắt đầu quá trình Seeding cho Demo Production...');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('❌ DATABASE_URL chưa được khai báo trong biến môi trường');
  }

  const pool = new Pool({ connectionString, ssl: true }); // Chú ý ssl: true nếu DB của bạn yêu cầu (Supabase/Neon)
  const db = drizzle(pool, { schema });

  try {
    const rawPassword = process.env.SEED_PASSWORD;
    if (!rawPassword) {
      throw new Error('❌ SEED_PASSWORD chưa được khai báo trong biến môi trường (.env)');
    }
    const hashedPassword = await argon2.hash(rawPassword);
    console.log(`🔐 Đã mã hóa mật khẩu mặc định bằng Argon2.`);

    console.log('🧹 Đang làm sạch dữ liệu cũ (Xóa theo thứ tự để tránh lỗi Khóa ngoại)...');
    // Xóa theo thứ tự con -> cha. Có thể cần bổ sung thêm các bảng như order_items, batches nếu DB đã có rác.
    await db.execute(sql`TRUNCATE TABLE users, warehouses, stores, products, base_units, system_configs CASCADE`);
    console.log('✅ Đã làm sạch Database.');

    // --------------------------------------------------------
    // 1. SEED SYSTEM CONFIGS
    // --------------------------------------------------------
    console.log('⚙️ Đang tạo cấu hình hệ thống (System Configs)...');
    const configsToCreate = [
      { key: 'AUTO_CANCEL_SHIPMENT_DAYS', value: '3', description: 'Nếu sau 3 ngày mà Store không nhấn "Xác nhận nhận hàng", hệ thống sẽ tự đóng Shipment.' },
      { key: 'FEFO_STRICT_MODE', value: 'TRUE', description: 'Nếu là TRUE, chặn xuất lô mới nếu còn lô cũ. Nếu FALSE, chỉ hiện Warning.' },
      { key: 'MAX_ORDER_QUANTITY_PER_ITEM', value: '500', description: 'Giới hạn số lượng tối đa cho 1 món hàng trong 1 đơn.' },
      { key: 'DEFAULT_PREP_TIME_HOURS', value: '12', description: 'Thời gian sơ chế mặc định (tiếng) nếu sản phẩm chưa được khai báo thời gian cụ thể' },
      { key: 'DEFAULT_TRANSIT_TIME_HOURS', value: '6', description: 'Thời gian vận chuyển mặc định (tiếng) từ kho tổng đến cửa hàng nếu Store chưa khai báo' },
      { key: 'ORDER_CLOSING_TIME', value: '01:00', description: 'Sau giờ này, mọi đơn hàng sẽ được tính là đặt của ngày hôm sau' },
      { key: 'MIN_STOCK_ALERT_THRESHOLD', value: '30', description: 'Nếu tồn kho của một sản phẩm xuống dưới 30, Dashboard của Manager sẽ hiện cảnh báo đỏ.' }
    ];
    await db.insert(schema.systemConfigs).values(configsToCreate);
    console.log(`✅ Đã tạo ${configsToCreate.length} System Configs.`);

    // --------------------------------------------------------
    // 2. SEED STORES & WAREHOUSES
    // --------------------------------------------------------
    console.log('🏪 Đang tạo Cửa hàng và Kho lưu trữ...');
    // Central Store (Hub) dành riêng cho Bếp Trung Tâm
    // Business logic: nhân sự central phải scope theo "central store" chứ không phải franchise store.
    const [centralStore] = await db.insert(schema.stores).values({
      name: 'CENTRAL KITCHEN - HUB TỔNG',
      address: 'Khu Công Nghiệp Tân Bình, TP.HCM',
      phone: '02812345678',
      managerName: 'Giám Đốc Vận Hành',
      maxStorageCapacity: '100000',
      transitTimeHours: 0,
    }).returning();

    const [store1] = await db.insert(schema.stores).values({
      name: 'KFC Franchise - Quận 1 (Demo)',
      address: '123 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
      phone: '0909123456',
      managerName: 'Nguyễn Văn Quản Lý',
      maxStorageCapacity: '5000', // Sức chứa theo PRD
      transitTimeHours: 2,
    }).returning();

    const [store2] = await db.insert(schema.stores).values({
      name: 'KFC Franchise - Phú Nhuận',
      address: '15 Phan Xích Long, Phú Nhuận, TP.HCM',
      phone: '0909654321',
      managerName: 'Trần Cửa Hàng',
      maxStorageCapacity: '3000',
      transitTimeHours: 1,
    }).returning();

    // Khởi tạo Bếp Trung Tâm (Central Kitchen) và Kho ứng với Store
    // Lưu ý: luồng kitchen ưu tiên tìm `warehouses.type='central'` theo `storeId` trong JWT.
    // Vì vậy central cần gắn đúng với `centralStore.id`.
    const warehousesToCreate: typeof schema.warehouses.$inferInsert[] = [
      // Central warehouse thuộc về Central Store Hub
      { name: 'Kho Bếp Trung Tâm (Central) - Hub Tổng', type: 'central', storeId: centralStore.id },

      // Hub global (dành cho JWT không có storeId / dữ liệu legacy)
      { name: 'Kho Bếp Trung Tâm (Central) - Hub Legacy', type: 'central', storeId: null },

      // Kho nội bộ theo từng store
      { name: 'Kho KFC Quận 1', type: 'store_internal', storeId: store1.id },
      { name: 'Kho KFC Phú Nhuận', type: 'store_internal', storeId: store2.id },

      // Tránh lỗi NotFoundException ở endpoint /inventory/store khi admin scope theo centralStore.
      // (Dữ liệu inventory ở đây có thể rỗng nhưng endpoint sẽ không throw.)
      { name: 'Kho Nội Bộ Central Store', type: 'store_internal', storeId: centralStore.id },
    ];
    await db.insert(schema.warehouses).values(warehousesToCreate);
    console.log('✅ Đã tạo 3 Cửa hàng và tạo warehouses cho Central Hub + 2 Store + store_internal cho centralStore.');

    // --------------------------------------------------------
    // 3. SEED USERS & ROLES
    // --------------------------------------------------------
    console.log('👤 Đang tạo Users cho các Roles...');
    const usersToCreate = [
      // Nhóm quản lý & Bếp trung tâm -> Thuộc về Central Store Hub
      { username: 'admin', email: 'admin@gmail.com', role: 'admin' as const, storeId: centralStore.id, name: 'System Admin' },
      { username: 'manager', email: 'manager@gmail.com', role: 'manager' as const, storeId: centralStore.id, name: 'Operation Manager' },
      { username: 'coordinator', email: 'coordinator@gmail.com', role: 'supply_coordinator' as const, storeId: centralStore.id, name: 'Supply Coordinator' },
      { username: 'chef', email: 'kitchen@gmail.com', role: 'central_kitchen_staff' as const, storeId: centralStore.id, name: 'Head Chef' },
      // Staff cho Store 1 (Quận 1)
      { username: 'staff_q1', email: 'staff1@gmail.com', role: 'franchise_store_staff' as const, storeId: store1.id, name: 'Nhân viên Quận 1' },
      // Staff cho Store 2 (Phú Nhuận)
      { username: 'staff_pn', email: 'staff2@gmail.com', role: 'franchise_store_staff' as const, storeId: store2.id, name: 'Nhân viên Phú Nhuận' },
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
    }
    console.log(`✅ Đã tạo ${usersToCreate.length} tài khoản người dùng.`);

    // --------------------------------------------------------
    // 4. SEED BASE UNITS & PRODUCTS
    // --------------------------------------------------------
    console.log('📦 Đang tạo Base Units và Danh mục Sản phẩm...');
    
    // Tạo đơn vị tính
    const [unitKg] = await db
      .insert(schema.baseUnits)
      .values({ name: 'Kilogram', description: 'kg', isActive: true })
      .returning();
    const [unitLiter] = await db
      .insert(schema.baseUnits)
      .values({ name: 'Lít', description: 'L', isActive: true })
      .returning();
    const [unitBox] = await db
      .insert(schema.baseUnits)
      .values({ name: 'Thùng', description: 'box', isActive: true })
      .returning();
    const [unitPc] = await db
      .insert(schema.baseUnits)
      .values({ name: 'Cái / Miếng', description: 'pc', isActive: true })
      .returning();
    const [unitBag] = await db
      .insert(schema.baseUnits)
      .values({ name: 'Bao / Gói', description: 'bag', isActive: true })
      .returning();

    // Tạo sản phẩm
    const productsToCreate: typeof schema.products.$inferInsert[] = [
      // Nguyên liệu thô (Raw Materials)
      { name: 'Thịt Gà Nguyên Con Lọc Xương', sku: 'RAW-CHK-001', type: 'raw_material', baseUnitId: unitKg.id, unitPrice: '55000', weightKg: '1.0', volumeM3: '0.002', isHighValue: true, prepTimeHours: 0, shelfLifeDays: 7, minShelfLife: 0 },
      { name: 'Bột Phủ Chiên Gà Tẩm Gia Vị', sku: 'RAW-PWD-001', type: 'raw_material', baseUnitId: unitBag.id, unitPrice: '250000', weightKg: '5.0', volumeM3: '0.010', isHighValue: false, prepTimeHours: 0, shelfLifeDays: 180, minShelfLife: 0 },
      { name: 'Dầu Chiên Chuyên Dụng Bếp', sku: 'RAW-OIL-001', type: 'raw_material', baseUnitId: unitLiter.id, unitPrice: '35000', weightKg: '0.9', volumeM3: '0.001', isHighValue: false, prepTimeHours: 0, shelfLifeDays: 365, minShelfLife: 0 },
      { name: 'Sốt Cà Chua (Ketchup)', sku: 'RAW-SAU-001', type: 'raw_material', baseUnitId: unitBox.id, unitPrice: '120000', weightKg: '5.0', volumeM3: '0.008', isHighValue: false, prepTimeHours: 0, shelfLifeDays: 365, minShelfLife: 0 },
      
      // Bán thành phẩm / Thành phẩm (Finished Goods)
      { name: 'Gà Rán Truyền Thống (Cánh/Đùi)', sku: 'FG-CHK-TRAD', type: 'finished_good', baseUnitId: unitPc.id, unitPrice: '35000', weightKg: '0.2', volumeM3: '0.001', isHighValue: false, prepTimeHours: 2, shelfLifeDays: 2, minShelfLife: 0 },
      { name: 'Gà Rán Giòn Cay (Cánh/Đùi)', sku: 'FG-CHK-SPICY', type: 'finished_good', baseUnitId: unitPc.id, unitPrice: '38000', weightKg: '0.2', volumeM3: '0.001', isHighValue: false, prepTimeHours: 2, shelfLifeDays: 2, minShelfLife: 0 },
      { name: 'Khoai Tây Chiên (Phần lớn)', sku: 'FG-POT-LARGE', type: 'finished_good', baseUnitId: unitPc.id, unitPrice: '25000', weightKg: '0.15', volumeM3: '0.001', isHighValue: false, prepTimeHours: 1, shelfLifeDays: 3, minShelfLife: 0 },
      { name: 'Bánh Mì Hamburger Gà', sku: 'FG-HAM-CHK', type: 'finished_good', baseUnitId: unitPc.id, unitPrice: '45000', weightKg: '0.25', volumeM3: '0.002', isHighValue: false, prepTimeHours: 1, shelfLifeDays: 1, minShelfLife: 0 },

      // Hàng bán lại (Resell Products)
      { name: 'Nước Ngọt Coca Cola (Thùng 24 Lon)', sku: 'RES-COCA-24', type: 'resell_product', baseUnitId: unitBox.id, unitPrice: '180000', weightKg: '8.5', volumeM3: '0.015', isHighValue: false, prepTimeHours: 0, shelfLifeDays: 365, minShelfLife: 0 },
      { name: 'Nước Khoáng Dasani (Thùng 24 Chai)', sku: 'RES-DASA-24', type: 'resell_product', baseUnitId: unitBox.id, unitPrice: '100000', weightKg: '12.0', volumeM3: '0.018', isHighValue: false, prepTimeHours: 0, shelfLifeDays: 365, minShelfLife: 0 },
    ];

    await db.insert(schema.products).values(productsToCreate);
    console.log(`✅ Đã tạo ${productsToCreate.length} Sản phẩm mẫu.`);

    console.log('\n🎉 Hoàn thành quá trình Seeding. Sẵn sàng cho Demo!');
  } catch (error) {
    console.error('❌ Lỗi trong quá trình Seeding:', error);
    process.exit(1);
  } finally {
    // Đảm bảo đóng kết nối để script không bị treo
    await pool.end();
  }
};

runSeed();