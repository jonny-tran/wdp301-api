import { randomBytes } from 'node:crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { VN_TZ } from '../time/vn-time';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Chuẩn hóa SKU cho segment mã lô (chữ số, tối đa 32 ký tự). */
export function sanitizeSkuForBatchCode(sku: string): string {
  const s = sku.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return s.length > 0 ? s.slice(0, 32) : 'X';
}

/**
 * Mã lô nhập / thành phẩm: [SKU]-YYYYMMDD-[RANDOM_HEX]
 * Ví dụ: CKWINGS-20260401-A1B2C3D4 (ngày theo Asia/Ho_Chi_Minh)
 */
export function generateInboundBatchCode(sku: string): string {
  const skuPart = sanitizeSkuForBatchCode(sku);
  const dateStr = dayjs().tz(VN_TZ).format('YYYYMMDD');
  const randomPart = randomBytes(4).toString('hex').toUpperCase();
  return `${skuPart}-${dateStr}-${randomPart}`;
}

/** Alias — cùng format với nhập kho / sản xuất nội bộ */
export const generateBatchCode = generateInboundBatchCode;
