import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { systemConfigs } from './schema';

// 1. Load biến môi trường từ file .env (để lấy DATABASE_URL)
dotenv.config();

async function runSeed() {
  console.log('🚀 Connecting to database...');

  // 2. Khởi tạo kết nối thực tế
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    console.log('🌱 Seeding System Configs...');

    const configs = [
      {
        key: 'ORDER_CLOSING_TIME',
        value: '16:00',
        description:
          'Sau giờ này, Store Staff không được phép tạo đơn hàng mới cho ngày hôm sau.',
      },
      {
        key: 'DEFAULT_PREP_TIME_HOURS',
        value: '24',
        description:
          'Giờ sơ chế mặc định khi sản phẩm chưa có prepTimeHours (tính ngày giao sớm nhất khi tạo đơn).',
      },
      {
        key: 'DEFAULT_TRANSIT_TIME_HOURS',
        value: '24',
        description:
          'Giờ vận chuyển mặc định khi cửa hàng chưa có transitTimeHours (tính ngày giao sớm nhất khi tạo đơn).',
      },
      {
        key: 'MIN_STOCK_ALERT_THRESHOLD',
        value: '20',
        description:
          'Nếu tồn kho của một sản phẩm xuống dưới 20, Dashboard của Manager sẽ hiện cảnh báo đỏ.',
      },
      {
        key: 'AUTO_CANCEL_SHIPMENT_DAYS',
        value: '3',
        description:
          'Nếu sau 3 ngày mà Store không nhấn "Xác nhận nhận hàng", hệ thống sẽ tự đóng Shipment.',
      },
      {
        key: 'FEFO_STRICT_MODE',
        value: 'TRUE',
        description:
          'Nếu là TRUE, chặn xuất lô mới nếu còn lô cũ. Nếu FALSE, chỉ hiện Warning.',
      },
      {
        key: 'MAX_ORDER_QUANTITY_PER_ITEM',
        value: '500',
        description: 'Giới hạn số lượng tối đa cho 1 món hàng trong 1 đơn.',
      },
    ];

    for (const config of configs) {
      await db
        .insert(systemConfigs)
        .values(config)
        .onConflictDoNothing({ target: systemConfigs.key });
      console.log(`   - Seeded key: ${config.key}`);
    }

    console.log('✅ System Configs seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:');
    console.error(error);
  } finally {
    // 3. Đóng kết nối để kết thúc script
    await pool.end();
  }
}

// 4. LỆNH QUAN TRỌNG NHẤT: Gọi hàm để thực thi khi chạy file
runSeed().catch((err) => {
  console.error(err);
  process.exit(1);
});
