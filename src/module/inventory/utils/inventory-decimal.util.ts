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

/** Phần trăm: part / whole * 100 */
export function invPct(part: number, whole: number): number {
  if (whole === 0 || !Number.isFinite(whole)) return 0;
  return (part / whole) * 100;
}
