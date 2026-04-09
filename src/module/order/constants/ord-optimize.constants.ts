/** Giá catalog lệch so với snapshot > 20% → cần xác nhận */
export const PRICE_JUMP_THRESHOLD = 0.2;

/** Kiểm kê cho hàng giá trị cao: tối đa bao nhiêu giờ trước đó được chấp nhận */
export const HIGH_VALUE_INVENTORY_CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Mặc định giờ lưu delivery_date để tránh lệch ngày khi hiển thị theo timezone */
export const DEFAULT_ORDER_DELIVERY_HOUR = 21;
export const DEFAULT_ORDER_DELIVERY_MINUTE = 55;
