# WH-OPTIMIZE: Vận hành kho theo manifest và FEFO cứng

Tài liệu này mô tả luồng **wave picking** (gom lấy hàng), **manifest** (chuyến xe), và **quét lô bắt buộc theo FEFO** trong API `warehouse`.

## 1. Soạn hàng hai bước: Bulk pick → Sort

1. **Bulk pick (Master list)**  
   Khi tạo manifest từ nhiều đơn (`POST /warehouse/manifests`), hệ thống gom tất cả dòng `shipment_items` thuộc các shipment đã gán vào manifest và **cộng dồn theo `product_id`**. Nhân viên nhận một danh sách tổng (ví dụ 10 cửa hàng × 2 kg gà → **một dòng 20 kg** đi một lần tới khu lạnh).

2. **Sort (chia thùng / crate)**  
   Sau khi đưa tổng lượng ra khu đệm, việc chia nhỏ theo từng đơn vẫn dựa trên từng `shipment` và từng `shipment_item` (chi tiết trong `GET /warehouse/manifests/:id/picking-list`).

## 2. Manifest so với đơn: Khi nào trừ tồn?

- **Đơn từng lẻ (legacy)** có thể xuất qua `PATCH /warehouse/shipments/finalize-bulk` — trừ kho ngay khi xác nhận soạn (mô hình cũ).
- **Manifest (WH-OPTIMIZE)**  
  Tồn **đã được giữ chỗ (reserved)** khi duyệt đơn; **physical + reserved chỉ giảm đồng bộ khi xe rời kho** (`POST /warehouse/manifests/:id/depart`).  
  Như vậy nếu xe đầy, xe trễ hoặc hủy chuyến, dữ liệu vẫn khớp thực tế kệ: chưa `depart` thì hàng vẫn thuộc trách nhiệm kho.

Nếu đơn đã nằm trong manifest, không dùng `finalize-bulk` cho đơn đó — API sẽ trả lỗi hướng dẫn dùng `depart` theo manifest.

## 3. Quét lô nghiêm (Strict scan)

- Mỗi dòng `shipment_items` có `suggested_batch_id` (FEFO sau khi tạo manifest / sau khi báo hỏng lô).  
- `PATCH /warehouse/manifests/:id/verify-item` so sánh `scannedBatchId` với lô chỉ định. **Không khớp → 403** với thông báo tiếng Việt; không ghi nhận lô “tiện tay” gần cửa hơn.
- Nếu lô chỉ định hỏng thật: `POST /warehouse/manifests/:id/report-batch-issue` (kèm `shipmentItemId`, `batchId`, `reason`). Hệ thống đổi lô, cập nhật `suggested_batch_id`, rồi mới quét tiếp.

## 4. Hủy chuyến trước khi xe chạy

`POST /warehouse/manifests/:id/cancel` (trạng thái `preparing`): hoàn **reserved** về **available** theo từng shipment, gỡ `manifest_id`, manifest chuyển `cancelled`.

## 5. An toàn đồng thời khi xe rời

Trong transaction `depart`, gọi `pg_advisory_xact_lock(manifest_id)` để tránh xác nhận trùng hai lần cùng một manifest.
