/**
 * So sánh phần dư sau phép tính kho (numeric/decimal từ DB) — tránh nhiễu float đơn giản.
 * Không thay thế decimal đầy đủ cho tiền tệ; đủ cho định mức sản xuất (độ chính xác 4–6 chữ số).
 */
export const DECIMAL_RESIDUAL_EPS = 1e-6;

/** Parse an toàn giá trị numeric từ Drizzle/pg (string | number). */
export function fromDbDecimal(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const t = String(value).trim().replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Còn nhu cầu phân bổ nguyên liệu (remaining sau FEFO). */
export function hasMaterialRemaining(remaining: number): boolean {
  return remaining > DECIMAL_RESIDUAL_EPS;
}

export function isLossPositive(loss: number): boolean {
  return loss > DECIMAL_RESIDUAL_EPS;
}

export function isSurplusPositive(surplus: number): boolean {
  return surplus > DECIMAL_RESIDUAL_EPS;
}

/** plannedQuantity / actualQuantity đầu vào API (number). */
export function isPositivePlannedQuantity(q: number): boolean {
  return Number.isFinite(q) && q > DECIMAL_RESIDUAL_EPS;
}
