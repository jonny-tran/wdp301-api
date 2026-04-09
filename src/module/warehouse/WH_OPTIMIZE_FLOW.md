# Warehouse Module — Contract cho Frontend

Tài liệu này mô tả chính xác endpoint, role, và luồng nghiệp vụ của `warehouse` theo code hiện tại.

## 1) Base path và role

- Base path: `/warehouse`
- Auth: Bearer JWT + `AtGuard` + `RolesGuard`
- Role chính:
  - `central_kitchen_staff`: vận hành kho
  - `admin`, `manager`, `supply_coordinator`: điều phối gom chuyến (`manifest/consolidate`)

## 2) Luồng nghiệp vụ chính

- **Luồng task đơn lẻ**: xem task → soạn → có thể reset/hủy → finalize bulk.
- **Luồng manifest/wave**: gom nhiều shipment vào 1 manifest, tạo picking list gộp, quét FEFO cứng, rồi `depart` để xuất kho.
- **Điểm trừ tồn vật lý**:
  - Luồng manifest: tại `POST /warehouse/manifests/:id/depart`
  - Luồng bulk cũ: tại `PATCH /warehouse/shipments/finalize-bulk`

## 3) API chi tiết

| Method | Path | Roles | Mục đích |
|---|---|---|---|
| GET | `/warehouse/picking-tasks` | `central_kitchen_staff` | Danh sách task soạn (`approved`/`picking`) |
| GET | `/warehouse/picking-tasks/:id` | `central_kitchen_staff` | Chi tiết task theo `orderId` |
| POST | `/warehouse/tasks/:orderId/cancel` | `central_kitchen_staff` | Hủy task soạn đơn lẻ |
| PATCH | `/warehouse/picking-tasks/:orderId/reset` | `central_kitchen_staff` | Reset lượt soạn |
| PATCH | `/warehouse/shipments/finalize-bulk` | `central_kitchen_staff` | Xuất kho gộp nhiều đơn (legacy flow) |
| GET | `/warehouse/shipments/:id/label` | `central_kitchen_staff` | Lấy payload in phiếu |
| GET | `/warehouse/scan-check` | `central_kitchen_staff` | Quét tra cứu lô theo `batchCode` |
| POST | `/warehouse/batch/report-issue` | `central_kitchen_staff` | Báo hỏng/thiếu lô khi soạn đơn |
| POST | `/warehouse/manifest/consolidate` | `admin`,`manager`,`supply_coordinator` | Gom đơn theo route + tải trọng xe |
| POST | `/warehouse/manifests` | `central_kitchen_staff` | Tạo manifest wave picking |
| GET | `/warehouse/manifests/:id/picking-list` | `central_kitchen_staff` | Xem picking list gộp |
| PATCH | `/warehouse/manifests/:id/verify-item` | `central_kitchen_staff` | Quét xác nhận lô theo FEFO cứng |
| POST | `/warehouse/manifests/:id/report-batch-issue` | `central_kitchen_staff` | Báo hỏng lô trong manifest |
| POST | `/warehouse/manifests/:id/depart` | `central_kitchen_staff` | Xác nhận xe rời kho, xuất kho hàng loạt |
| POST | `/warehouse/manifests/:id/cancel` | `central_kitchen_staff` | Hủy manifest trước khi depart |

## 4) Hợp đồng request/response quan trọng

- `POST /warehouse/tasks/:orderId/cancel`
  - Body: `{ "reason": "..." }`
  - Rule:
    - Chỉ hủy khi order `approved|picking`
    - Nếu shipment đang nằm trong manifest `preparing` thì chặn (phải xử lý manifest trước)
  - Tác động:
    - release reserved
    - shipment `cancelled`
    - order `cancelled` + `cancel_reason`

- `POST /warehouse/manifest/consolidate`
  - Body: `ConsolidateManifestDto` (`orderIds[]`, `vehicleId`, `driverName?`, `driverPhone?`)
  - Rule:
    - đơn phải `approved`, chưa gán shipment chính
    - cùng route
    - xe phải ở trạng thái `available`
    - tải trọng tính theo `quantity_approved` (không dùng `quantity_requested`)
  - Tác động:
    - tạo manifest
    - lưu `vehicle_id`, `vehicle_plate`, `driver_name`, `driver_phone`
    - tính `totalWeightKg` + `totalVolumeM3`; nếu vượt ngưỡng thì gắn `manifest.overload_warning = true` (không chặn tạo)
    - shipment status -> `consolidated`
    - đơn -> `picking`
    - tạo picking list gộp

- `POST /warehouse/manifests/:id/depart`
  - Rule:
    - manifest phải `preparing`
    - các dòng phải quét đủ (`actualBatchId` có giá trị)
  - Tác động:
    - giảm `physical` + `reserved` theo từng dòng shipment item
    - ghi `inventory_transactions` type `export`
    - shipment -> `in_transit`
    - order -> `delivering`
    - manifest -> `departed`
    - vehicle -> `in_transit` (được khóa trạng thái ở logistics service)

## 5) FE lưu ý triển khai

- Ưu tiên màn manifest cho wave lớn, chỉ dùng `finalize-bulk` cho luồng cũ.
- Khi quét lô trong manifest, nếu backend trả lỗi sai FEFO thì bắt buộc đổi đúng lô.
- Sau mọi thao tác `cancel/depart/finalize`, FE cần refetch list + detail vì trạng thái thay đổi theo transaction.
