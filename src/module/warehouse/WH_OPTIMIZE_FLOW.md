# Warehouse (WH-OPTIMIZE): Luồng vận hành kho & manifest

Tài liệu mô tả **luồng nghiệp vụ** và **API** module `warehouse` dành cho **Central Kitchen Staff**: soạn đơn lẻ, xuất kho gộp, **wave picking / manifest**, **FEFO cứng**, và **hủy task** trước khi giao.

> Tiền tố đường dẫn: toàn bộ route nằm dưới global prefix ứng dụng (ví dụ `/api`) + `warehouse/...` — ví dụ đầy đủ: `{PREFIX}/warehouse/manifests`.

---

## 1. Tổng quan hai chế độ

| Chế độ | Mục đích | Xuất kho (trừ physical) |
|--------|----------|-------------------------|
| **Đơn / shipment (legacy & bulk)** | Soạn và chốt qua `finalize-bulk` | Theo logic `PATCH .../shipments/finalize-bulk` |
| **Manifest (WH-OPTIMIZE)** | Gom nhiều đơn một chuyến xe, picking list gộp SKU | Chỉ khi **`POST .../manifests/:id/depart`** (xe rời kho) |

- Khi đơn đã gắn **manifest** đang `preparing`, không dùng `finalize-bulk` cho đơn đó — API sẽ báo lỗi và hướng dẫn dùng luồng manifest / `depart`.

---

## 2. Task soạn hàng (đơn lẻ)

### 2.1 Danh sách & chi tiết

- **`GET /warehouse/picking-tasks`** — Phân trang/lọc (`GetPickingTasksDto`: `page`, `limit`, `search`, `date`).  
  Trạng thái đơn hiển thị: **`approved`** hoặc **`picking`**.
- **`GET /warehouse/picking-tasks/:id`** — `id` = **orderId**. Trả về nhóm theo sản phẩm và các lô gợi ý (FEFO) từ `shipment_items` / shipment liên quan.

### 2.2 Hủy task soạn (mới)

- **`POST /warehouse/tasks/:orderId/cancel`**  
  Body: `{ "reason": string }` (tối thiểu 3 ký tự, tối đa 2000).

**Điều kiện & hậu quả (một transaction):**

1. Đơn phải **`approved`** hoặc **`picking`**.
2. Nếu shipment của đơn gắn **manifest** và manifest đang **`preparing`** → **400**: phải xử lý manifest trước (ví dụ `POST .../manifests/:id/cancel`), không cho hủy lẻ để tránh lệch wave.
3. Nếu có shipment nhưng **không** còn `preparing` → **400** (đã vượt giai đoạn soạn chuẩn).
4. **`releaseStock(orderId)`** — hoàn **reserved** theo log `reservation` (hoặc fallback theo dòng shipment).
5. Shipment → **`cancelled`**.
6. Đơn → **`cancelled`**, lý do ghi vào cột **`orders.cancel_reason`** (không ghi đè `note` của đơn).

**Không** tạo giao dịch `waste`: chỉ **release** (physical không đổi; chỉ giảm chỗ giữ hàng).

### 2.3 Reset tiến độ soạn

- **`PATCH /warehouse/picking-tasks/:orderId/reset`** — Reset trạng thái soạn khi quét nhầm / cần phân bổ lại (shipment vẫn `preparing`).

### 2.4 Xuất kho gộp nhiều đơn (không manifest)

- **`PATCH /warehouse/shipments/finalize-bulk`** — Body `FinalizeBulkShipmentDto`. Trừ tồn / reserve, cập nhật shipment & trạng thái đơn trong **transaction**.

### 2.5 Tiện ích soạn

- **`GET /warehouse/shipments/:id/label`** — Payload in phiếu giao.
- **`GET /warehouse/scan-check?batchCode=...`** — Tra cứu nhanh lô tại kho trung tâm.
- **`POST /warehouse/batch/report-issue`** — Báo hỏng/thiếu lô khi soạn **đơn**; hệ thống tìm lô thay FEFO (`ReportIssueDto`).

---

## 3. WH-OPTIMIZE: Wave picking & manifest

### 3.1 Hai bước: Bulk pick → Sort

1. **Bulk pick (Master list)**  
   `POST /warehouse/manifests` (`CreateManifestDto`: danh sách `orderIds`). Hệ thống gom `shipment_items` của các shipment eligible và **cộng dồn theo `product_id`** (ví dụ nhiều cửa hàng × 2 kg → một dòng tổng).

2. **Sort (chia theo đơn)**  
   Chi tiết theo từng shipment vẫn lấy qua **`GET /warehouse/manifests/:id/picking-list`**.

### 3.2 Khi nào trừ tồn?

- **Manifest:** Tồn đã **reserve** khi duyệt đơn; **physical + reserved** giảm đồng bộ khi **`POST /warehouse/manifests/:id/depart`**.  
  Trước `depart`, hàng vẫn coi như trên kệ (chưa xuất xe).

### 3.3 Quét lô nghiêm (FEFO cứng)

- Mỗi `shipment_items` có `suggested_batch_id`.
- **`PATCH /warehouse/manifests/:id/verify-item`** — So `scannedBatchId` với lô chỉ định; **sai → 403** (tiếng Việt).
- **`POST /warehouse/manifests/:id/report-batch-issue`** — Lô hỏng trên manifest: đổi lô, cập nhật gợi ý, rồi quét tiếp (`ReportManifestBatchIssueDto`).

### 3.4 Xe rời kho

- **`POST /warehouse/manifests/:id/depart`** — Kiểm tra đã quét đủ; **EXPORT** theo từng dòng; shipment → vận chuyển; đơn → `delivering`; manifest `departed`; picking list `completed`.
- Trong transaction có **`pg_advisory_xact_lock`** theo `manifest_id` để tránh double depart.

### 3.5 Hủy manifest (chưa xuất xe)

- **`POST /warehouse/manifests/:id/cancel`** — Manifest `preparing` only: **`releaseStockForShipment`** từng shipment, gỡ `manifest_id`, manifest → `cancelled`.

---

## 4. Quan hệ: Hủy task đơn ↔ Manifest

```text
Đơn approved/picking, shipment preparing, KHÔNG manifest preparing
  → POST /warehouse/tasks/:orderId/cancel  ✅

Đơn đang trong manifest preparing
  → POST /warehouse/tasks/:orderId/cancel  ❌ (400)
  → POST /warehouse/manifests/:id/cancel   ✅ (hoàn reserve cả wave, gỡ manifest)
```

Sau khi hủy manifest, shipment không còn `manifest_id`; khi đó có thể xử lý từng đơn (hủy task / soạn lại) theo quy trình riêng.

---

## 5. Bảng tham chiếu API (Kitchen)

| Phương thức | Đường dẫn | Ghi chú |
|-------------|-----------|---------|
| GET | `/warehouse/picking-tasks` | Danh sách task (`approved` \| `picking`) |
| GET | `/warehouse/picking-tasks/:id` | Chi tiết theo `orderId` |
| POST | `/warehouse/tasks/:orderId/cancel` | Body `{ reason }` — hủy soạn + `cancel_reason` |
| PATCH | `/warehouse/picking-tasks/:orderId/reset` | Làm lại lượt soạn |
| PATCH | `/warehouse/shipments/finalize-bulk` | Xuất kho gộp (không dùng khi đơn đã manifest) |
| GET | `/warehouse/shipments/:id/label` | In phiếu |
| GET | `/warehouse/scan-check` | Query `batchCode` |
| POST | `/warehouse/batch/report-issue` | Sự cố lô khi soạn đơn |
| POST | `/warehouse/manifests` | Tạo wave |
| GET | `/warehouse/manifests/:id/picking-list` | Master list theo manifest |
| PATCH | `/warehouse/manifests/:id/verify-item` | Quét đúng FEFO |
| POST | `/warehouse/manifests/:id/report-batch-issue` | Đổi lô trên manifest |
| POST | `/warehouse/manifests/:id/depart` | Xuất kho + xe đi |
| POST | `/warehouse/manifests/:id/cancel` | Hủy wave, hoàn reserve |

---

## 6. File code liên quan

- `warehouse.controller.ts` — Định nghĩa route & Swagger.
- `warehouse.service.ts` — `cancelPickingTask`, manifest, finalize, FEFO strict, v.v.
- `warehouse.repository.ts` — Truy vấn shipment/manifest/picking list.
- `dto/` — `CancelPickingTaskDto`, `CreateManifestDto`, `FinalizeBulkShipmentDto`, `VerifyManifestItemDto`, …
- Hủy đơn & `cancel_reason`: `order.repository.ts` (`updateStatusWithReason` khi `cancelled`).
- Hoàn reserve: `inventory.service.ts` — `releaseStock`, `releaseStockForShipment`.

---

*Tài liệu đồng bộ với code tại nhánh hiện tại; khi thêm endpoint, cập nhật mục 5 và luồng tương ứng.*
