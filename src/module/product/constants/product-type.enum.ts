/**
 * Phân loại SKU: nguyên liệu bếp vs hàng đặt từ franchise vs hàng NCC/brand.
 */
export enum ProductType {
  RAW_MATERIAL = 'raw_material',
  FINISHED_GOOD = 'finished_good',
  RESELL_PRODUCT = 'resell_product',
}

/** Loại sản phẩm được phép đặt trên đơn franchise */
export const ORDERABLE_PRODUCT_TYPES: ProductType[] = [
  ProductType.FINISHED_GOOD,
  ProductType.RESELL_PRODUCT,
];

/** Dùng cho `inArray` Drizzle (literal union) */
export const ORDERABLE_PRODUCT_TYPE_VALUES = [
  'finished_good',
  'resell_product',
] as const;
