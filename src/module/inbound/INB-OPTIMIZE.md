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
- `DELETE /inbound/receipts/:id` — xóa **toàn bộ** phiếu chỉ khi `status = draft`; role `central_kitchen_staff` hoặc `manager`. Trong một transaction: xóa mọi `receipt_items`, xóa các `batches` gắn dòng legacy (nếu có), rồi xóa `receipts`.
- `DELETE /inbound/receipts/:receiptId/items/:itemId` — xóa dòng nháp (có `batch_id` legacy thì xóa luôn batch tạm).

## Danh sách endpoint đầy đủ (`/inbound`)

| Method | Path | Roles | Mục đích |
|---|---|---|---|
| GET | `/inbound/products` | `central_kitchen_staff` | Chọn sản phẩm cho phiếu nhập |
| POST | `/inbound/receipts` | `central_kitchen_staff` | Tạo phiếu nhập draft |
| GET | `/inbound/receipts` | `central_kitchen_staff` | Danh sách phiếu nhập |
| GET | `/inbound/receipts/:id` | `central_kitchen_staff` | Chi tiết phiếu |
| POST | `/inbound/receipts/:id/items` | `central_kitchen_staff` | Thêm dòng hàng |
| PATCH | `/inbound/receipts/:id/complete` | `central_kitchen_staff` | Chốt phiếu, tạo batch, cộng tồn |
| PATCH | `/inbound/receipts/:id/variance-approval` | `manager`,`supply_coordinator` | Duyệt nhập vượt ngưỡng |
| DELETE | `/inbound/receipts/:id` | `central_kitchen_staff`,`manager` | Xóa phiếu draft |
| DELETE | `/inbound/receipts/:receiptId/items/:itemId` | `central_kitchen_staff` | Xóa dòng draft |
| DELETE | `/inbound/items/:batchId` | `central_kitchen_staff` | Xóa dòng theo batchId (legacy) |
| GET | `/inbound/batches/:id/label` | `central_kitchen_staff` | Data in tem lô |
| POST | `/inbound/batches/reprint` | `central_kitchen_staff` | Yêu cầu in lại tem |

## Sinh mã lô

- Định dạng: **`BAT-{YYYYMMDD}-{SKU_SANITIZED}-{SEQ4}`** (SEQ đếm theo prefix ngày + SKU trong DB, transaction-safe).
- Hàm: `InboundRepository.nextBatchCode(tx, sku)`.

## Liên quan `products.type` (nhập kho)

- Dòng phiếu gắn `receipt_items.product_id` — SKU đó thuộc master `products` có cột **`type`** (`raw_material` | `finished_good` | `resell_product`).
- **Nhập từ NCC** thường là nguyên liệu / hàng bán lại; **thành phẩm nội bộ** chủ yếu sinh từ **production** (xuất hiện lô mới), không bắt buộc qua inbound trừ khi nghiệp vụ có nhập TP từ ngoài.
- Catalog đặt hàng franchise **không** liên quan trực tiếp inbound — xem `ORD-OPTIMIZE.md` / `product_type`.

## Module Production liên quan (cập nhật)

- Bảng: `recipes`, `recipe_items`, `production_orders`, `production_reservations`.
- Enum `inventory_transactions`: `production_consume`, `production_output`.
- `POST /production/recipes` — BOM: thành phẩm `finished_good`, nguyên liệu `raw_material`.
- `POST /production/orders` -> `POST /production/orders/:id/start` -> `POST /production/orders/:id/complete`.
- Không còn bất kỳ endpoint Salvage.

## Migration

Chạy lần lượt SQL trong repo (theo journal); tối thiểu liên quan inbound/production:

- `drizzle/0012_inbound_optimize.sql`
- `drizzle/0013_production_module.sql`
- `drizzle/0026_product_type_enum.sql` — enum & cột `products.type`
- `drizzle/0028_recipe_drop_standard_output.sql` — bỏ `recipes.standard_output`

## Cấu hình gợi ý

Thêm vào `system_configs`:

- Key: `inbound.receipt_variance_percent` — ví dụ giá trị `3` (3%).

## Ghi chú legacy

Phiếu / dòng cũ đã tạo **batch** lúc thêm dòng (trước refactor): khi chốt, nhánh có `batch_id` chỉ kích hoạt lô + nhập kho như cũ; không bắt buộc `storage_location_code` trên các dòng đó.
