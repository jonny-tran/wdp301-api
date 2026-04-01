/** Độ chính xác cho số lượng tồn kho (cùng scale với DB numeric 10,2 / 12,2). */
export const INV_DECIMAL_PLACES = 2;

export function invRound2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function invFromDb(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? invRound2(value) : 0;
  }
  const t = String(value).trim().replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? invRound2(n) : 0;
}

export function invToDbString(n: number): string {
  return invRound2(n).toFixed(INV_DECIMAL_PLACES);
}

/** Số lượng dạng cents (BigInt) — tránh lỗi float khi so sánh / trừ (tương đương Decimal 2 chữ số). */
export function invToCents(value: unknown): bigint {
  return BigInt(Math.round(invFromDb(value) * 100));
}

export function invCentsToNumber(cents: bigint): number {
  return invRound2(Number(cents) / 100);
}

export function invCentsToDbString(cents: bigint): string {
  return invToDbString(invCentsToNumber(cents));
}

/** Phần trăm: part / whole * 100 */
export function invPct(part: number, whole: number): number {
  if (whole === 0 || !Number.isFinite(whole)) return 0;
  return (part / whole) * 100;
}
