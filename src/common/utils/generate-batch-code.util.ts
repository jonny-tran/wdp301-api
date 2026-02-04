// src/common/utils/generate-code.util.ts

/**
 * Sinh mã Batch Code theo format: [SKU]-[YYYYMMDD]-[RANDOM_4_CHARS]
 * Ví dụ: CK-WINGS-20260204-A1B2
 */
export const generateBatchCode = (sku: string): string => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${sku.toUpperCase()}-${dateStr}-${randomChars}`;
};
