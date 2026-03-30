# Inventory Audit Logic (SP26SWP07)

## Phương trình vàng (Golden Equation)

Trên mỗi lô (`batches`) và khi gộp theo kho (`inventory`):

**Physical = Available + Reserved**

- **Physical (`inventory.quantity` / `batches.physical_quantity` tổng hợp):** số lượng thực tế trong kho.
- **Available:** phần có thể bán / đặt thêm (không nằm trong giữ chỗ).
- **Reserved:** phần đã giữ cho đơn hàng / quy trình (đặt chỗ đã duyệt, sản xuất…).

Mọi thay đổi **phải** đi qua `InventoryService` trong **một transaction** (atomic), kèm **một dòng ghi nhận** tương ứng trong `inventory_transactions` (immutable — chỉ insert, không update).

## Vì sao cấm cập nhật SQL trực tiếp lên `batches` / `inventory`?

- Mất **audit trail**: không thể truy ngược lý do biến động.
- Dễ **vỡ phương trình** Physical = Available + Reserved khi chỉ sửa một cột.
- Vi phạm **FEFO + đệm `min_shelf_life`** nếu công cụ SQL bỏ qua điều kiện chọn lô.

Chỉ **repository** trong module inventory (được gọi bởi `InventoryService`) mới thực hiện cập nhật; sau đó **đồng bộ** `batches.physical_quantity`, `available_quantity`, `reserved_quantity` từ tổng `inventory`.

## Ngưỡng 5% và ảnh chứng minh (`evidence_image`)

Với **`adjustStock`** (điều chỉnh **giảm**):

- Nếu **|delta| > 5%** so với **tồn vật lý lô** tại kho đó, **bắt buộc** có `evidenceImage` (ảnh chứng minh).
- Nếu không đủ điều kiện, API trả lỗi nghiệp vụ (tiếng Việt) thay vì ghi âm thầm.

## Loại giao dịch (immutable log)

| Loại (DB)       | Ý nghĩa ngắn gọn                          |
|----------------|-------------------------------------------|
| `reservation`  | Đặt chỗ đơn: Available ↓, Reserved ↑      |
| `release`      | Hoàn chỗ: Reserved ↓, Available ↑         |
| `export`       | Xuất giao: Physical ↓, Reserved ↓         |
| `adjust_loss`  | Điều chỉnh trừ (hao hụt / mất…)           |
| `adjust_surplus` | Điều chỉnh tăng (kiểm kê dư)          |

## FEFO và đệm an toàn (`min_shelf_life`)

Chỉ chọn lô khi:

`expiry_date > CURRENT_DATE + min_shelf_life` (ngày)

và sắp xếp **`ORDER BY expiry_date ASC`** (FEFO).

Điều này tránh bán lô “còn HSD nhưng không đủ thời gian an toàn” cho cửa hàng (mô hình KFC / bếp trung tâm).
