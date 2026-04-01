/** Mã lý do điều chỉnh kho bếp (payload FE) — map vào reason text + audit */
export enum KitchenInventoryAdjustReasonCode {
  DAMAGE = 'DAMAGE',
  WASTE = 'WASTE',
  PRODUCTION_WASTE = 'PRODUCTION_WASTE',
  INPUT_ERROR = 'INPUT_ERROR',
  EXPIRED = 'EXPIRED',
}
