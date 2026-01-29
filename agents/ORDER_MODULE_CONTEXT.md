# TÀI LIỆU CẤU TRÚC VÀ NGỮ CẢNH MODULE ORDER - DỰ ÁN SP26SWP07

## 1. TỔNG QUAN NGỮ CẢNH (BUSINESS CONTEXT)

Module Order là trung tâm điều phối nhu cầu từ các Cửa hàng Franchise (Store) về Bếp Trung Tâm (Central Kitchen). Hệ thống vận hành theo mô hình "KFC Supply Chain", tập trung vào việc kiểm soát lô hàng (Batch) và hạn sử dụng (Expiry Date).

### 1.1. Các Nguyên Tắc Nghiệp Vụ Cốt Lõi (Strict Rules)

1. **Blind Ordering (Đặt hàng mù):** Nhân viên Store khi đặt hàng KHÔNG được xem số lượng tồn kho của Bếp. Họ đặt dựa trên nhu cầu thực tế của cửa hàng.
2. **No Backorders (Không treo đơn):** Nếu Bếp thiếu hàng, Coordinator chỉ duyệt số thực tế có thể giao. Phần chênh lệch giữa "Yêu cầu" và "Duyệt" sẽ bị hủy ngay lập tức, hệ thống không nợ đơn sang ngày hôm sau.
3. **FEFO (First Expired, First Out):** Việc xuất kho bắt buộc phải ưu tiên các lô (Batch) có hạn sử dụng gần nhất.
4. **Data Isolation (Cô lập dữ liệu):** Store nào chỉ thấy đơn hàng của Store đó. `store_id` phải được lấy từ JWT Token (CurrentUser), không lấy từ Request Body.
5. **Soft-Reservation (Giữ chỗ tạm thời):** Khi đơn hàng chuyển sang `APPROVED`, hệ thống lập tức cộng vào `reserved_quantity` của các Lô tương ứng.

- **Công thức:** `Available Stock = Physical Stock - Reserved Stock`.

### 1.2. Trạng Thái Đơn Hàng (Order Status Lifecycle)

- **`pending`**: Mới tạo, chờ Coordinator duyệt.
- **`approved`**: Đã duyệt số lượng & đã giữ chỗ hàng (Soft-reservation).
- **`rejected`**: Coordinator từ chối đơn (kèm lý do).
- **`cancelled`**: Store chủ động hủy (chỉ khi còn là `pending`).
- **`picking`**: Nhân viên Bếp đang soạn hàng theo lô đã chỉ định.
- **`delivering`**: Hàng đã rời kho và đang trên xe vận chuyển.
- **`completed`**: Store đã xác nhận nhận hàng thành công.
- **`claimed`**: Đã nhận hàng nhưng có sai lệch/hư hỏng (Ticket khiếu nại).

---

## 2. KIẾN TRÚC MÃ NGUỒN (TECHNICAL ARCHITECTURE)

Module tuân thủ kiến trúc phân lớp (Layered Architecture) để dễ bảo trì và mở rộng.

### 2.1. Cấu trúc thư mục

- `order.repository.ts`: Chuyên trách truy vấn Drizzle ORM. Sử dụng `FOR UPDATE` khi chạy FEFO để tránh Race Condition.
- `order.service.ts`: Chứa "Bộ não" FEFO Engine, xử lý Transaction và điều phối giữa Order - Shipment.
- `order.controller.ts`: Tiếp nhận Request, phân quyền Role (Store Staff vs Coordinator).
- `order.swagger.ts`: Tập trung toàn bộ Documentation cho Swagger API.
- `dto/`: Định nghĩa các kiểu dữ liệu đầu vào/đầu ra và Validation rules.

### 2.2. Logic FEFO Engine (Phase 3 & 4)

Khi Coordinator thực hiện API `approveOrder`:

1. **Tìm Batch:** Truy vấn bảng `batches` theo `product_id`.
2. **Sắp xếp:** `ORDER BY expiry_date ASC`.
3. **Lọc:** Chỉ lấy các lô có `(physical_quantity - reserved_quantity) > 0` và chưa hết hạn.
4. **Phân bổ:** Trừ dần số lượng cần duyệt vào `available_stock` của từng lô.
5. **Trigger Shipment:** Tự động tạo bản ghi trong bảng `shipments` (status: `preparing`) và `shipment_items` (lưu chi tiết `batch_id` và `quantity` đã giữ).

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU (SCHEMA REFERENCES)

- **`orders`**: Lưu `id`, `store_id`, `status`, `delivery_date` ( validation).
- **`order_items`**: Lưu `product_id`, `quantity_requested`, `quantity_approved`.
- **`batches`**: Lưu `batch_code`, `expiry_date`, `physical_quantity`, `reserved_quantity`.
- **`shipments` / `shipment_items**`: Lưu vết lô hàng nào sẽ giao cho đơn hàng nào.

---

## 4. HƯỚNG DẪN TRIỂN KHAI CHO AI (AI IMPLEMENTATION GUARDRAILS)

Luôn đính kèm chỉ thị này khi yêu cầu AI viết code mới:

> \*"Hãy dựa trên kiến trúc Repository-Service-Controller trong ORDER_MODULE_CONTEXT.md.
>
> 1. Sử dụng Database Transaction cho mọi thao tác cập nhật kho.
> 2. Tuân thủ thuật toán FEFO: Ưu tiên lô hạn gần nhất, tính tồn dựa trên Physical - Reserved.
> 3. Đảm bảo Data Isolation: Luôn filter theo store_id từ CurrentUser.
> 4. No Backorders: Nếu Requested=10 mà kho có 7, chỉ duyệt 7, hủy 3."\*

---

**Tech Lead Note:** File này hiện đã đầy đủ logic để bạn thực hiện từ việc Đặt hàng cho đến khi hàng rời kho. Hãy giữ nguyên các định dạng Status là chữ thường (`pending`, `approved`...) để khớp với Postgres Enum trong `schema.ts`.
