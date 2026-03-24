# INB-OPTIMIZE — Cửa ngõ nhập hàng & lô (Batch-centric)

Tài liệu này mô tả **hợp đồng nghiệp vụ và kỹ thuật** sau refactor, để tra cứu nhanh không cần đọc lại toàn bộ code.

## Luồng tổng quát

1. **Tạo phiếu** `POST /inbound/receipts` → trạng thái `draft`.
2. **Thêm dòng hàng** `POST /inbound/receipts/:id/items` → chỉ ghi nhận dữ liệu trên `receipt_items` (chưa có `batch_id`).
3. **Chốt phiếu** `PATCH /inbound/receipts/:id/complete` → trong **một transaction**:
   - Khóa phiếu (`SELECT … FOR UPDATE`), khóa kho (`pg_advisory_xact_lock(90210, warehouseId)`), khóa sinh mã lô (`pg_advisory_xact_lock(871002, 1)` khi sinh mã).
   - Kiểm tra **nhập dư / sai số** so với `expected_quantity` (cấu hình `inbound.receipt_variance_percent` trong `system_configs`, mặc định logic test dùng `3` nếu chưa có key).
   - Với mỗi dòng có `quantity_accepted > 0`: tạo **batches** (mã `BAT-YYYYMMDD-SKU-XXXX`, múi giờ `Asia/Ho_Chi_Minh`), cập nhật `receipt_items.batch_id`, `available` batch, **upsert inventory**, ghi `inventory_transactions` loại `import`.
4. **Phê duyệt nhập dư** (khi vượt ngưỡng): `PATCH /inbound/receipts/:id/variance-approval` — role `manager` hoặc `supply_coordinator`.

## Dữ liệu chính (schema)

| Bảng / cột | Ý nghĩa |
|------------|---------|
| `batches.manufactured_date` | NSX bắt buộc (truy xuất nguồn gốc). |
| `receipt_items.product_id` | Sản phẩm dòng phiếu. |
| `receipt_items.quantity_accepted` / `quantity_rejected` | QC: nhận / từ chối. |
| `receipt_items.rejection_reason` | Bắt buộc khi có từ chối (validate ở service/DTO). |
| `receipt_items.expected_quantity` | Số dự kiến (đặt hàng) — dùng so sai số. |
| `receipt_items.manufactured_date`, `stated_expiry_date` | NSX và HSD khi tách lô (ví dụ nhiều HSD); HSD mặc định = NSX + `shelf_life_days` nếu không khai `stated_expiry_date`. |
| `receipt_items.storage_location_code` | Mã quét vị trí kệ (bắt buộc cho dòng **mới** khi chốt; dòng **legacy** đã có `batch_id` có thể chưa có). |
| `receipts.variance_approved_by` / `variance_approved_at` | Phê duyệt nhập dư. |

## API hữu ích

- `GET /inbound/receipts/:id?omitExpected=true` — ẩn `expectedQuantity` ở response (màn kiểm đếm).
- `DELETE /inbound/receipts/:receiptId/items/:itemId` — xóa dòng nháp (có `batch_id` legacy thì xóa luôn batch tạm).

## Sinh mã lô

- Định dạng: **`BAT-{YYYYMMDD}-{SKU_SANITIZED}-{SEQ4}`** (SEQ đếm theo prefix ngày + SKU trong DB, transaction-safe).
- Hàm: `InboundRepository.nextBatchCode(tx, sku)`.

## Module Production (tóm tắt)

- Bảng: `recipes`, `recipe_items`, `production_orders`, `production_reservations`.
- Enum `inventory_transactions`: thêm `production_consume`, `production_output`.
- `POST /production/orders` → draft; `POST /production/orders/:id/start` → reserve FEFO; `POST /production/orders/:id/finish` → trừ NL, tạo lô TP, log.

## Migration

Chạy lần lượt SQL trong repo:

- `drizzle/0012_inbound_optimize.sql`
- `drizzle/0013_production_module.sql`

## Cấu hình gợi ý

Thêm vào `system_configs`:

- Key: `inbound.receipt_variance_percent` — ví dụ giá trị `3` (3%).

## Ghi chú legacy

Phiếu / dòng cũ đã tạo **batch** lúc thêm dòng (trước refactor): khi chốt, nhánh có `batch_id` chỉ kích hoạt lô + nhập kho như cũ; không bắt buộc `storage_location_code` trên các dòng đó.
