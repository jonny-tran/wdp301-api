# TỔNG HỢP NGHIỆP VỤ & CẬP NHẬT HỆ THỐNG DÀNH CHO FRONTEND
**Dự án:** Central Kitchen & Franchise Supply Chain System (KFC Model)
**Đối tượng:** Frontend Developers, Mobile App Developers
**Mục tiêu:** Cập nhật các thay đổi nghiệp vụ mới nhất và hướng dẫn tích hợp API chính xác.

---

## 1. NGUYÊN TẮC CỐT LÕI (BẤT DI BẤT DỊCH)

Frontend cần nắm vững 3 nguyên tắc định hình toàn bộ giao diện và luồng xử lý:

* **Batch-centric (Trung tâm là Lô hàng):** * `Product` chỉ là "khuôn mẫu" (Tên, định lượng, SKU). Hàng hóa thực tế nằm trong kho phải là `Batch` (Lô).
    * *Frontend lưu ý:* Khi query kho hoặc thao tác xuất/nhận, luôn hiển thị và tương tác dựa trên `batch_id`.
* **FEFO (First Expired, First Out):**
    * Xuất kho bắt buộc ưu tiên lô hết hạn trước. 
    * *Frontend lưu ý:* Trên UI soạn hàng, hệ thống (BE) sẽ chỉ định sẵn lô cần lấy. Không cho phép user tự do chọn lô.
* **Phương trình Tồn kho (Golden Equation):**
    * `Physical Quantity` (Tồn vật lý) = `Available` (Khả dụng) + `Reserved` (Đã giữ chỗ).
    * *Frontend lưu ý:* Khi cho phép Store đặt hàng, chỉ hiển thị và validate dựa trên `Available`, tuyệt đối không dùng `Physical`.

---

## 2. PHÂN HỆ ĐẶT HÀNG (ORDER MODULE)

Quy trình xử lý đơn hàng có các bản cập nhật quan trọng về chống nợ đơn và lưu trữ giá:

* **Lưu Snapshot giá (Price Snapshot):** * Khi Store tạo đơn, API sẽ copy giá và quy cách đóng gói lưu cứng vào đơn hàng. 
    * *Frontend lưu ý:* Giao diện Lịch sử đơn hàng phải lấy giá từ `order_items.price_snapshot`, không lấy từ `product.price` (do giá có thể đổi trong tương lai).
* **Không treo đơn (No Backorders & Partial Fulfillment):**
    * Nếu Store đặt 50, kho chỉ còn 30 -> Hệ thống duyệt 30 (`quantity_approved = 30`). 20 cái thiếu sẽ bị hủy, KHÔNG chuyển sang ngày hôm sau.
    * *Frontend lưu ý:* UI chi tiết đơn hàng phải hiển thị rõ `Yêu cầu: 50` | `Được duyệt: 30`.
* **Chờ sản xuất (Waiting for Production):**
    * Nếu kho thiếu hàng nhưng Bếp có thể nấu thêm, đơn hàng có thể rơi vào trạng thái `waiting_for_production`. Cần UI hiển thị trạng thái này cho Store biết đơn đang chờ làm thêm.
* **Gộp chuyến (Consolidation):**
    * Các đơn duyệt xong sẽ được gán `consolidation_group_id` để đi chung 1 chuyến xe (Shipment).

---

## 3. PHÂN HỆ NHẬN HÀNG & BÁO LỖI (RECEIVING & CLAIMS)

Đây là phân hệ nhạy cảm nhất, Mobile App tại Store cần xử lý chặt chẽ:

* **Ghi nhận Tồn kho Real-time:** * Khi Store nhận hàng, bắt buộc nhập số lượng thực nhận (`actualQty`). 
    * Tồn kho tại Store sẽ được **cộng ngay lập tức** dựa trên số thực nhận này, không phụ thuộc vào số lượng xuất đi.
* **Tự động tạo Khiếu nại (Claim):**
    * Nếu thực nhận < số lượng xuất (`shipped_qty`), hệ thống ngầm hiểu có sự cố (thất thoát, vỡ hỏng).
    * API nhận hàng sẽ tự động tạo `Claim` (Trạng thái `hasDiscrepancy: true`).
    * *Frontend lưu ý:* Khi User nhập số thực nhận nhỏ hơn số trên app -> UI phải bắt buộc hiện popup **chụp ảnh bằng chứng** và gọi Cloudinary để lấy `imageProofUrl` đính kèm vào payload API. Không có ảnh -> Block không cho nhận hàng.

---

## 4. PHÂN HỆ KHO & SOẠN HÀNG (WAREHOUSE MANIFEST)

Dành cho App của nhân viên Bếp Trung Tâm (Kitchen Staff):

* **Quét mã nghiêm ngặt (Strict Scan):** * API trả về danh sách cần soạn (`picking-tasks`) luôn kèm theo `suggested_batch_id` (Lô bắt buộc phải lấy theo FEFO).
    * *Frontend lưu ý:* App quét mã vạch phải so khớp mã vạch thực tế với `suggested_batch_id`. Nếu sai mã -> **Báo lỗi 403 Đỏ rực**, cấm nhân viên tiện tay lấy lô gần nhất.
* **Báo lỗi Lô hàng (Report Batch Issue):**
    * Nếu Lô mà hệ thống chỉ định bị chuột cắn/hư hỏng thực tế -> Staff bấm nút "Báo lỗi lô này" -> FE gọi API `report-batch-issue`. BE sẽ ghi nhận hỏng và chỉ định `suggested_batch_id` lô mới để quét lại.
* **Chốt trừ kho khi xe chạy (Depart):**
    * Lúc soạn xong, hàng vẫn thuộc kho Bếp (ở trạng thái `Reserved`). Chỉ khi xe chính thức lăn bánh (Giao diện Điều phối bấm "Depart"), hệ thống mới trừ tồn kho `Physical`.

---

## 5. PHÂN HỆ SẢN XUẤT (PRODUCTION)

Kiểm soát việc biến đổi Nguyên liệu -> Thành phẩm (đồng bộ với `products.type`):

* **Master sản phẩm:** Thành phẩm sản xuất là SKU **`finished_good`**; nguyên liệu trong BOM là **`raw_material`** (API từ chối loại khác).
* **Tạo BOM (`POST /production/recipes`):** Body có `productId` (TP) + `items[].productId` (NL) + `quantity` (định mức cho **1 đơn vị** TP). Không nhập tên công thức / không còn `standardOutput` — xem `PROD-LOGIC-FINAL.md`.
* **Tạo lệnh (`POST /production/orders`):** Gửi **`productId`** (TP) + `plannedQuantity`; backend tìm **một** recipe active — không gửi `recipeId`.
* **Tạm giữ nguyên liệu (Reserve):** * Khi ấn "Bắt đầu sản xuất", hệ thống khóa (Reserve) nguyên liệu theo công thức (BOM) và FEFO.
* **Công thức tính Hạn sử dụng Thành phẩm:**
    * Hạn dùng của lô Gà Rán (Thành phẩm) = Min(Hạn lý thuyết, Hạn của lô thịt gà sống, Hạn của lô bột). Thành phẩm không được có hạn dùng vượt quá hạn nguyên liệu tạo ra nó.
* **Hao hụt & Dư thừa (Loss & Surplus):**
    * Khi hoàn tất sản xuất, Staff nhập "Số lượng thực tế làm ra".
    * *Frontend lưu ý:* UI so sánh số thực tế vs số lý thuyết. Nếu làm ra dư hoặc thiếu so với công thức, yêu cầu User nhập "Lý do giải trình" (Note) mới cho phép gọi API Complete.
* **Truy xuất nguồn gốc (Batch Lineage):**
    * UI xem chi tiết một Lô (Batch) của thành phẩm sẽ có 1 tab "Gia phả" (Lineage) hiển thị danh sách các lô nguyên liệu đã cấu thành nên nó.

---

## TỔNG KẾT ACTION ITEMS CHO FRONTEND

1. **Hiển thị Tồn kho:** Luôn cẩn thận hỏi BE (hoặc check docs) xem dùng cột `Available` hay `Physical` cho UI hiện tại. 
2. **Form Nhận hàng:** Thêm module upload ảnh bắt buộc nếu `actualQty < shippedQty`.
3. **Màn hình Quét vạch:** Handle lỗi 403 khi quét sai lô chỉ định, thêm nút "Báo lỗi lô" (Report Issue) trực tiếp trên màn hình quét.
4. **Hiển thị Đơn giá:** Xóa bỏ logic "tham chiếu chéo giá từ bảng Product" trong các màn Lịch sử/Hóa đơn. Render trực tiếp `price_snapshot` từ `order_items`.