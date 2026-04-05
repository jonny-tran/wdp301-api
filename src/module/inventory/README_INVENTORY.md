# Tồn kho ba lớp (Physical / Available / Reserved)

- **Physical:** hàng thực tế trong kho (theo lô + kho).
- **Available:** phần có thể bán hoặc đặt thêm (đã trừ phần đang giữ chỗ).
- **Reserved:** phần đã khóa cho đơn đã duyệt / quy trình khác; khi giao hàng sẽ trừ đồng thời Physical và Reserved.

Phương trình kiểm soát: **Physical = Available + Reserved** (đồng bộ trên bảng `batches` từ tổng `inventory`).

## Quy trình điều chỉnh (hao hụt / mất cắp)

1. Gọi **`InventoryService.adjustStock`** với `quantityDelta` (âm = giảm, dương = tăng).
2. Giảm **> 5%** giá trị tồn lô **bắt buộc** có `evidenceImage`.
3. Mỗi lần điều chỉnh tạo **một** bản ghi `inventory_transactions` loại `adjust_loss` hoặc `adjust_surplus` (immutable).
4. Bảng **`inventory_adjustment_tickets`** dùng cho quy trình phê duyệt quản lý khi mở rộng (schema đã có).

## FEFO và đệm an toàn

- Sản phẩm có **`min_shelf_life`** (ngày): chỉ cho phép đặt khi HSD lô **lớn hơn** `CURRENT_DATE + min_shelf_life`.
- Chọn lô theo **`expiry_date ASC`** (FEFO).

## Đối soát và truy vết

1. Với mỗi lô, lấy tổng `inventory_transactions` theo `batch_id` và `warehouse_id`.
2. Cộng `quantity_change` theo từng `type` để đối chiếu với biến động trên `inventory`.
3. `reference_id` liên kết đơn hàng / shipment / phiếu (UUID dạng text).

Chi tiết lý thuyết: `docs/INVENTORY_AUDIT_LOGIC.md`.

## Độ chính xác số học

Module dùng helper làm tròn 2 chữ số thập phân (`src/module/inventory/utils/inventory-decimal.util.ts`), tương thích `numeric` trên PostgreSQL. Có thể thay bằng thư viện `decimal.js` nếu dự án thêm dependency và chuẩn hóa import tại util này.
