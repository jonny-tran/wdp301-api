# PROD-LOGIC — Sản xuất & định mức (BOM)

Phân hệ mô tả vòng đời lệnh sản xuất: **nháp → đang thực hiện (giữ chỗ nguyên liệu) → hoàn tất (sản lượng thực tế, lô thành phẩm, truy xuất nguồn gốc)**.

## 1. Ba bước kiểm tra trước khi bắt đầu sản xuất

Khi gọi `POST /production/orders/:id/start`, hệ thống thực hiện lần lượt:

1. **Công thức (formula)**  
   - Recipe tồn tại, `isActive = true`.  
   - Có ít nhất một dòng `recipe_items` (định mức nguyên liệu).  
   - Thành phẩm đầu ra (`output_product_id`) còn hiệu lực (`products.is_active`).

2. **Số lượng (quantity)**  
   - Với mỗi nguyên liệu, nhu cầu =  
     `plannedQuantity × (quantity_per_output ÷ standard_output)`  
     trong đó `standard_output` là định mức đầu ra chuẩn của công thức (mặc định 1).  
   - Tổng tồn **khả dụng** trên từng lô (theo kho của lệnh) phải đủ để đáp ứng nhu cầu.  
   - Khả dụng = `inventory.quantity − inventory.reserved_quantity` (per `warehouse_id` + `batch_id`).

3. **Hạn dùng (expiry)**  
   - Nguyên liệu được lấy theo **FEFO** (sắp xếp `batches.expiry_date` tăng dần).  
   - Khi xét tới một lô có tồn khả dụng > 0, nếu `expiry_date < ngày hiện tại` (múi giờ VN), toàn bộ thao tác bị **chặn**: nhân viên phải xử lý lô hết hạn trước (không bỏ qua sang lô mới hơn trong kịch bản “lô cũ nhất còn tồn nhưng đã quá hạn”).

## 2. Cơ chế giữ chỗ (available vs reserved)

- Tồn thực tế nằm ở bảng `inventory` (theo cặp kho + lô).  
- **Khả dụng** để xuất cho việc khác = `quantity − reserved_quantity`.  
- Khi lệnh chuyển sang **đang thực hiện**, phần nguyên liệu cần cho lệnh được chuyển vào `reserved_quantity` (tăng reserved, không giảm `quantity` ngay).  
- Các lệnh xuất kho khác chỉ thấy phần còn lại sau reserved — tránh “tranh” nguyên liệu đã dành cho bếp.

Cột `batches.available_quantity` / `batches.reserved_quantity` (nếu có sau migration) phục vụ mở rộng/báo cáo; **nguồn số liệu vận hành chính** vẫn là `inventory`.

## 3. Hoàn tất sản xuất & hao hụt

- Người dùng nhập **sản lượng thực tế** (`actualQuantity`) qua `POST /production/orders/:id/complete`.  
- **Lý thuyết** = `plannedQuantity` trên lệnh.  
- Ghi nhận kho thành phẩm theo **thực tế** (cộng tồn lô mới đúng bằng `actualQuantity`).  
- Giao dịch kho:  
  - `production_output` với số thay đổi = **định mức (planned)** — phản ánh kế hoạch.  
  - Nếu `actual < planned`: thêm dòng `adjustment` âm với lý do **`PRODUCTION_LOSS`** (hao hụt).  
  - Nếu `actual > planned`: bắt buộc `surplusNote`; thêm `adjustment` dương với lý do **`PRODUCTION_SURPLUS`** (kèm ghi chú).  
- Tổng phần “kế hoạch + điều chỉnh” khớp với số lượng thực nhập kho.

## 4. Truy xuất nguồn gốc — `batch_lineage`

Mỗi lần hoàn tất, với mỗi lô nguyên liệu đã tiêu hao, hệ thống ghi một dòng trong `batch_lineage`:

- `parent_batch_id` — lô nguyên liệu.  
- `child_batch_id` — lô thành phẩm mới tạo.  
- `production_order_id` — lệnh sản xuất.  
- `consumed_quantity` — lượng đã trừ từ lô cha.

Tra cứu `child_batch_id` cho biết toàn bộ lô đầu vào phục vụ điều tra chất lượng / thu hồi.

## 5. API tóm tắt

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|--------|
| POST | `/production/recipes` | Tạo BOM |
| POST | `/production/orders` | Tạo lệnh nháp (`plannedQuantity`) |
| POST | `/production/orders/:id/start` | Kiểm tra 3 bước + giữ chỗ FEFO |
| POST | `/production/orders/:id/complete` | Nhập `actualQuantity`, hoàn tất, lineage, hao hụt/dư |

Mã lệnh (`production_orders.code`) sinh dạng `PO-YYYYMMDD-XXXX`. Mã lô thành phẩm dùng `generate-batch-code.util` (SKU + ngày + hậu tố ngẫu nhiên), có kiểm tra trùng trước khi chèn.
