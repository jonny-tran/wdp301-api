# PROJECT CONTEXT: Central Kitchen & Franchise Management System (KFC Model)

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL.

## 1. NGUYÊN TẮC NGHIỆP VỤ CỐT LÕI (CORE BUSINESS RULES)

Đây là các quy tắc "bất di bất dịch", AI cần tuân thủ khi viết logic:

1. **Batch-Centric:** Tồn kho không quản lý theo sản phẩm chung chung. Mỗi sản phẩm trong kho phải gắn liền với một **Lô (Batch)** có `expiry_date` (Hạn sử dụng) và `batch_code` riêng.
2. **FEFO (First Expired, First Out):** Khi xuất kho hoặc gợi ý hàng, luôn ưu tiên Batch có hạn sử dụng gần nhất.
3. **No Backorders:** Hệ thống không treo nợ đơn. Nếu Bếp thiếu hàng, chỉ duyệt số lượng đang có (Partial Fulfillment), phần còn lại hủy bỏ.
4. **Discrepancy Handling (Xử lý sai lệch):** Khi nhận hàng (Receiving), Store nhập `actual_qty` (thực nhận) và `damaged_qty` (hàng hỏng).

- `Tồn kho Store tăng = actual_qty - damaged_qty`.
- Nếu `actual_qty < expected_qty` HOẶC `damaged_qty > 0` -> **Tự động tạo Ticket Khiếu nại (Claim)**.

## 2. TRẠNG THÁI HỆ THỐNG (ENUMS & FLOW)

AI cần kiểm tra kỹ `schema.ts` trước khi map trạng thái:

- **Order Status:** `pending` -> `approved`/`rejected` -> `picking` -> `delivering` -> `completed`/`claimed`.
- **Shipment Status:** `preparing` -> `in_transit` -> `delivered` -> `completed`.
- **Claim Status:** `pending` -> `approved` -> `rejected`.

## 3. CẤU TRÚC SOURCE CODE

- `src/module/[module_name]`: Chia theo module nghiệp vụ (Order, Shipment, Inventory, Claim).
- `src/database/schema.ts`: **Source of Truth** cho cấu trúc bảng. Không được tự ý thêm field nếu không có trong schema.
- **Data Isolation:** Hầu hết các API của Store Staff phải filter theo `store_id` lấy từ Token (`req.user.storeId`).

## 4. QUY ĐỊNH VỀ PHẢN HỒI (API RESPONSE)

- **Thành công:** `message: "success"` (Tiếng Anh).
- **Thất bại/Lỗi (Exceptions):** `message` phải bằng **Tiếng Việt** để hiển thị trực tiếp lên Mobile App cho người dùng.
- _Ví dụ:_ `"Không tìm thấy lô hàng này"`, `"Số lượng thực nhận không được lớn hơn số lượng gửi"`.

## 5. ĐẶC TẢ ENDPOINTS CẦN THỰC HIỆN (RECEIVING & CLAIMS)

### A. Phân hệ Shipment (Cho Franchise Store Staff)

1. **GET `/shipments/incoming**`

- **Mục đích:** Lấy danh sách các chuyến hàng đang trên đường đến Store.
- **Logic:** Filter `shipments` có `status = 'in_transit'` và `destinationStoreId = user.storeId`.

2. **GET `/shipments/:id**`

- **Mục đích:** Xem chi tiết một chuyến hàng và các Batch bên trong.
- **Logic:** Join bảng `shipment_items` và `batches` để lấy thông tin SKU và số lượng dự kiến (`quantity`).

### B. Phân hệ Receiving (Nghiệp vụ quan trọng nhất)

3. **POST `/shipments/:id/receive**`

- **Mục đích:** Xác nhận nhận hàng và cập nhật kho Store.
- **Input:** `items: [{ batchId, actualQty, damagedQty }], notes, evidenceUrls`.
- **Logic (Bắt buộc dùng Transaction):**

1. Check trạng thái Shipment phải là `in_transit`.
2. Cập nhật Shipment status -> `completed`.
3. Với mỗi item:

- Update tồn kho Store (`inventory` table): `quantity = quantity + (actualQty - damagedQty)`.
- Nếu có sai lệch (Thực nhận < Dự kiến hoặc Hàng hỏng > 0): Tự động tạo bản ghi vào bảng `claims` và `claim_items`.
- Ghi log vào `inventory_transactions` với type `import`.

### C. Phân hệ Claims & Inventory

4. **GET `/claims**`: Lấy danh sách khiếu nại của Store hiện tại.
5. **GET `/inventory/store**`: Xem tồn kho hiện tại của Store (Group theo Product và detail theo Batch).

## 6. LƯU Ý KỸ THUẬT CHO AI

- Sử dụng `drizzle-orm` cho các câu lệnh query.
- Luôn kiểm tra quyền truy cập (Role: `franchise_store_staff`).
- Đảm bảo tính nhất quán dữ liệu: Khi cộng kho Store, Batch ID phải giữ nguyên từ Bếp trung tâm để đảm bảo tính truy xuất nguồn gốc (Traceability).

---

**Tech Lead Note:** Hãy sử dụng nội dung trên làm context. Khi thực hiện, hãy chú ý đặc biệt vào bước **Transaction trong API Receive** vì đây là phần dễ gây sai sót dữ liệu nhất.
