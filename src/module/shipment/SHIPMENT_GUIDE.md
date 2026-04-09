# Shipment Module — API Contract cho Frontend

## 1) Base path và trạng thái

- Base path: `/shipments`
- Trạng thái chính:
  - `preparing` -> `consolidated` -> `in_transit` -> `completed`
  - có thể có `departed`, `delivered`, `cancelled` tùy luồng kho/manifest

## 2) Endpoint matrix

| Method | Path | Roles | Mục đích |
|---|---|---|---|
| GET | `/shipments` | `manager`,`supply_coordinator`,`admin` | Danh sách shipment toàn hệ thống |
| GET | `/shipments/store/my` | `franchise_store_staff` | Danh sách shipment của store trong JWT |
| GET | `/shipments/:id/picking-list` | `supply_coordinator`,`central_kitchen_staff`,`admin` | Picking list theo shipment |
| GET | `/shipments/:id` | user đăng nhập | Chi tiết shipment; staff store chỉ xem shipment của store mình |
| PATCH | `/shipments/:id/receive-all` | `franchise_store_staff` | Nhận nhanh toàn bộ hàng |
| POST | `/shipments/:id/receive` | `franchise_store_staff` | Nhận hàng chi tiết thiếu/hỏng |

## 3) Query/Body contract cần FE bám sát

- `GET /shipments` query (`GetShipmentsDto`):
  - `page`, `limit`, `status`, `storeId`, `search`, `fromDate`, `toDate`

- `POST /shipments/:id/receive` body (`ReceiveShipmentDto`):
  - `items[]` optional
    - `batchId`
    - `actualQty`
    - `damagedQty`
    - `evidenceUrls?`
  - Nếu `items` rỗng/không gửi: mặc định nhận đủ như shipped

## 4) Rule nghiệp vụ bắt buộc

- Receive chỉ hợp lệ khi shipment đang `in_transit`.
- Store staff chỉ nhận shipment đúng store mình (so với `storeId` trong JWT).
- Trong receive:
  - `goodQty = actualQty - damagedQty` (phải >= 0)
  - `goodQty` được nhập vào kho store (`inventory import`)
  - nếu thiếu/hỏng, hệ thống tự tạo claim line
- Tất cả chạy trong 1 transaction: update inventory + shipment status + claim + order status.

## 5) Consolidation & capacity (đã nâng cấp)

- Hệ thống hỗ trợ shipment gộp nhiều order qua bảng `shipment_orders`.
- Tổng tải được tính theo:
  - `totalWeight = Σ(weight_kg * quantity)`
  - `totalVolume = Σ(volume_m3 * quantity)`
- So sánh với config `VEHICLE_MAX_WEIGHT_KG`:
  - quá tải -> `overload_warning = true` trên shipment.

## 6) Snapshot giao hàng

- Khi tạo shipment từ luồng batch/consolidation, backend snapshot địa chỉ giao và thông tin liên hệ tại thời điểm tạo shipment.
- FE nên ưu tiên dữ liệu snapshot trên shipment để hiển thị chứng từ giao hàng, tránh lệch do store master bị đổi sau đó.
