# System Config — Keys dùng cho Warehouse/Manifest

Tài liệu này mô tả các key cấu hình đang được Warehouse/Order/Shipment sử dụng để FE và BE cùng hiểu đúng hành vi runtime.

## 1) Các key chính

| Key | Module dùng | Ý nghĩa |
|---|---|---|
| `VEHICLE_MAX_WEIGHT_KG` | Shipment/Order | Ngưỡng tải trọng chuẩn để tính cảnh báo quá tải shipment |
| `VEHICLE_MAX_VOLUME_M3` | Warehouse | Ngưỡng thể tích tối đa dùng cho manifest consolidation (nếu có cấu hình) |
| `FEFO_STRICT_MODE` | Warehouse | `TRUE` thì chặn xuất sai FEFO, `FALSE` chỉ cảnh báo log |
| `ORDER_CLOSING_TIME` | Order | Giờ chốt đơn để tính ngày giao hợp lệ |

## 2) Quy tắc áp dụng trong Warehouse consolidate

- `POST /warehouse/manifest/consolidate`:
  - luôn tính:
    - `totalWeight = Σ(quantity_approved * product.weight_kg)`
    - `totalVolume = Σ(quantity_approved * product.volume_m3)`
  - `quantity_approved` là nguồn dữ liệu chuẩn cho tải xe.
- `overload_warning` của manifest bật `true` khi:
  - `totalWeight > vehicle.payload_capacity`, hoặc
  - có `VEHICLE_MAX_VOLUME_M3` và `totalVolume` vượt ngưỡng này.

## 3) Lưu ý triển khai FE

- Khi response trả `overloadWarning = true`, FE vẫn có thể cho tiếp tục nhưng phải hiển thị cảnh báo điều phối.
- Nếu muốn chặn cứng overload ở UI, dùng rule riêng phía FE dựa trên `totalWeightKg`, `maxPayloadKg`, `totalVolumeM3`, `maxVolumeM3` từ response.
