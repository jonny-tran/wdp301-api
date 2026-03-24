# ORD-OPTIMIZE — Module Order (SP26SWP07)

Tài liệu rút gọn: nghiệp vụ, API, tham số, phân trang, và các ràng buộc để không cần đọc lại toàn bộ mã nguồn.

## Phạm vi

- **Snapshot** giá / đơn vị / quy cách đóng gói trên `order_items` lúc tạo đơn.
- **Giới hạn đặt hàng** theo `stores.max_storage_capacity` và kiểm kê bắt buộc cho `products.is_high_value`.
- **Hủy đơn**: cửa hàng chỉ `pending`; điều phối **force cancel** kèm **restock task**.
- **Lead time**: `MAX(prep_time_hours)` trong giỏ + `stores.transit_time_hours`.
- **Gộp shipment**: `orders.consolidation_group_id` + merge vào shipment `preparing` cùng nhóm.
- **Ràng buộc cứng**: nợ chứng từ (in_transit > 48h), cảnh báo quá tải xe (`VEHICLE_MAX_WEIGHT_KG`), lệch giá >20% khi duyệt.

## Enum trạng thái đơn (`OrderStatus`)

`pending` → `approved` | `rejected` | `cancelled` → các trạng thái vận hành (`picking`, `delivering`, …) → `completed` | `claimed`.

## Base URL

Tất cả route dưới prefix global (ví dụ `/api`) — xem `main.ts` / `FRONTEND_API_INTEGRATION.md`.

| Method | Path | Role | Mô tả |
|--------|------|------|--------|
| GET | `/orders` | Manager, Coordinator, Admin | Danh sách có filter/pagination (`GetOrdersDto`) |
| POST | `/orders` | Franchise Staff, Admin | Tạo đơn (`CreateOrderDto`) |
| GET | `/orders/catalog` | Franchise Staff, Admin | Catalog sản phẩm |
| GET | `/orders/my-store` | Franchise Staff, Admin | Đơn cửa hàng (gán `storeId` từ JWT) |
| PATCH | `/orders/franchise/:id/cancel` | Franchise Staff, Admin | Hủy — **chỉ `pending`** |
| PATCH | `/orders/franchise/:id/confirm-price` | Franchise Staff, Admin | Gỡ khóa xác nhận giá sau khi lệch >20% |
| GET | `/orders/coordinator/:id/review` | Coordinator, Admin | So sánh tồn kho trung tâm |
| PATCH | `/orders/coordinator/:id/approve` | Coordinator, Admin | Duyệt (`ApproveOrderDto`) |
| PATCH | `/orders/coordinator/:id/reject` | Coordinator, Admin | Từ chối |
| PATCH | `/orders/coordinator/:id/force-cancel` | Coordinator, Manager, Admin | Hủy bắt buộc + reserve + `restock_tasks` |
| GET | `/orders/:id` | Coordinator, Franchise, Manager, Admin | Chi tiết |
| GET | `/orders/analytics/fulfillment-rate` | Manager, Admin | Fill rate |
| GET | `/orders/analytics/performance/lead-time` | Manager, Admin | SLA |

## Pagination (`GetOrdersDto` / chung)

Kế thừa `PaginationParamsDto`: `page`, `limit`, `sortBy`, `sortOrder`. Response list: `items` + `meta` (totalItems, currentPage, …).

## POST `/orders` — `CreateOrderDto`

| Field | Bắt buộc | Mô tả |
|-------|----------|--------|
| `deliveryDate` | Có | ISO date; phải ≥ ngày sớm nhất theo lead time |
| `items[]` | Có | `{ productId, quantity }` |
| `lastInventoryCheckTimestamp` | Có nếu có SP `is_high_value` | ISO 8601, trong vòng 24h |

**Logic nội bộ (tóm tắt):**

- Chặn nếu có shipment `in_transit` với `ship_date` quá 48h (nợ chứng từ).
- Snapshot: `unit_snapshot` (tên base unit), `price_snapshot`, `packaging_info_snapshot` từ catalog.
- `orders.total_amount` = tổng `price_snapshot × quantity`.
- `consolidation_group_id`: tái sử dụng nếu đã có đơn `pending` cùng store, cùng ngày giao, cùng ngày đặt (VN).

## PATCH `/orders/coordinator/:id/approve` — `ApproveOrderDto`

| Field | Mô tả |
|-------|--------|
| `force_approve` | Bắt buộc khi fill rate < 20% (giữ hành vi cũ) |
| `price_acknowledged` | Bắt buộc khi giá catalog lệch >20% so với `price_snapshot` |
| `production_confirm` | Bắt buộc khi thiếu hàng một phần (partial) trước khi giao |

**Mã lỗi JSON (BadRequest):**

- `PRODUCTION_CONFIRMATION_REQUIRED` — thiếu `production_confirm`; đơn được gắn `requires_production_confirm`.
- `PRICE_CONFIRMATION_REQUIRED` — thiếu `price_acknowledged`; đơn được gắn `pending_price_confirm`.

**Shipment:** gọi `ShipmentService.createShipmentForOrder` với `consolidation_group_id` và tải trọng tối đa từ config `VEHICLE_MAX_WEIGHT_KG` (cảnh báo `overload_warning`).

## Database (Drizzle) — cột / bảng mới

- `products`: `unit_price`, `prep_time_hours`, `packaging_info`, `weight_kg`, `volume_m3`, `is_high_value`
- `stores`: `max_storage_capacity`, `transit_time_hours`
- `order_items`: `unit_snapshot`, `price_snapshot`, `packaging_info_snapshot`
- `orders`: `consolidation_group_id`, `requires_production_confirm`, `pending_price_confirm`
- `shipments`: `consolidation_group_id`, `total_weight_kg`, `total_volume_m3`, `overload_warning`, `delivered_at`
- `shipment_orders` (shipment_id, order_id): gộp nhiều đơn một chuyến
- `restock_tasks`: nhiệm vụ hoàn kho sau force cancel

**Migration:** `drizzle/0010_ord_optimize.sql` (+ journal `0010_ord_optimize`).

## Config hệ thống (liên quan)

- `ORDER_CLOSING_TIME` — giờ chốt đặt (VN)
- `VEHICLE_MAX_WEIGHT_KG` — ngưỡng cảnh báo quá tải (tùy chọn)

## Ghi chú tích hợp Frontend

- Response wrapper camelCase (Interceptor) — field DB snake_case được map khi serialize.
- Đơn cũ không có `price_snapshot`: bước duyệt **bỏ qua** so sánh lệch giá (điều kiện `priceSnapshot == null`).
