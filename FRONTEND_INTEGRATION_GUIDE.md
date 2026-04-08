# Hướng dẫn tích hợp Frontend — SCM / Order / Logistics / Warehouse / Production

Tài liệu tổng hợp **các luồng nghiệp vụ và API quan trọng** mà team Frontend cần nắm khi nối với backend (NestJS).  
**Base URL API:** `/{globalPrefix}/{version}/...` — hiện tại: **`/wdp301-api/v1`** (xem `main.ts`). Mọi endpoint dưới đây là **path tương đối** sau prefix này.

**Auth:** Bearer JWT; quyền theo `@Roles(...)` trên từng endpoint.

---

## 1. Tổng quan nghiệp vụ (Core Business Rules)

### 1.1. Smart Approval — ATP (Available-to-Promise)

**Mục đích:** Trước khi Supply Coordinator duyệt đơn, hệ thống ước lượng **có bao nhiêu hàng thực sự “an toàn”** để giao đến ngày giao dự kiến, tránh phân bổ lô sẽ hết hạn trên đường vận chuyển.

**Công thức mốc HSD tối thiểu (Safety Window):**

1. Lấy **thời gian vận chuyển** `travelHours` từ cửa hàng:
   - Ưu tiên `store.route.estimatedHours` (giờ ước lượng trên **Route**).
   - Nếu không có: dùng `store.transitTimeHours`.
   - Nếu vẫn không hợp lệ: **fallback 24h**.
2. Cộng thêm **buffer cố định 2 giờ** (`ATP_BUFFER_HOURS`).
3. Tính **ngày mốc tối thiểu** (chuỗi `YYYY-MM-DD`, timezone VN):

   `safetyMinimumExpiryDate = deliveryDate (VN) + travelHours + bufferHours` (làm tròn theo logic `dayjs` trong `order.service.ts`).

**ATP cho từng SKU:** Chỉ cộng tồn khả dụng từ các lô có **`expiry_date` đủ “xa” hơn mốc trên** (FEFO trong nhóm lô thỏa điều kiện), với khả dụng ≈ `quantity - reservedQuantity` tại kho trung tâm.

**API gợi ý (read-only, không ghi DB):** `GET /orders/coordinator/:id/approval-suggestion` — trả về từng dòng: `requested`, `atpAvailable`, `suggestedApprove`, `canceledByStock`, `mode` (`FULL_APPROVE` | `PARTIAL_FULFILLMENT` | `NO_STOCK`), cùng `safetyMinimumExpiryDate`, `travelHoursUsed`, `bufferHours`, `summarySuggestion`.

**Gợi ý UI:** Hiển thị rõ mốc HSD an toàn và lý do **partial / reject** để SC không phải “đoán” bằng tồn thô từ màn `review`.

---

### 1.2. Manifest Consolidation — Gom đơn theo Route & tải trọng xe

**Mục đích:** Một chuyến xe nên chở các đơn **cùng tuyến (route)** để tối ưu logistics; đồng thời **không vượt payload** xe.

**Luồng chính (`POST /warehouse/manifest/consolidate`):**

| Điều kiện | Hệ thống |
|-----------|----------|
| Cùng `route_id` (lấy từ **store** của từng đơn) | Bắt buộc; lệch route → lỗi `Orders must belong to the same route` |
| Mỗi cửa hàng đã gán route | `routeId == null` → lỗi nghiệp vụ |
| Đơn ở trạng thái **approved**, **chưa** có `shipment_id` | Ngược lại → lỗi từng đơn |
| Đủ shipment `preparing` sẵn cho các đơn | Thiếu / không đồng bộ → lỗi gom |
| Tổng khối lượng ≤ `vehicle.payload_capacity` | Vượt → `Vehicle overload (Total: … / Max: …)` |

**Cách tính khối lượng:**  
`Σ (quantity_approved × product.weight_kg)` theo từng đơn — **bắt buộc** master `products.weight_kg` hợp lệ để không sai tải trọng.

**Sau khi gom thành công:** Tạo **manifest**, cập nhật shipment → `consolidated`, gán `orders.shipment_id`, chuyển đơn sang **`picking`**, tạo **picking list** gộp theo manifest.

**Gợi ý UI:** Chặn chọn đơn khác route; hiển thị tổng kg so với trần xe **trước** khi gọi API; parse thông báo overload từ backend để show toast.

---

### 1.3. Salvage Production — Parent Batch → Child Batch

**Bản chất:** **Shelf-life extension** — chế biến **một lô nguyên liệu chỉ định** (không FEFO) thành thành phẩm mới, lô mới có HSD theo công thức / sản phẩm.

**Luồng API:**

1. **`POST /production/salvage`** — Tạo lệnh `production_type = salvage`, **lock đúng `input_batch_id`**, trạng thái lệnh vào ca làm việc (`in_progress`). BOM phải **đúng một dòng** nguyên liệu trùng sản phẩm trên lô; lô **chưa quá hạn** (VN).
2. **`POST /production/salvage/:id/complete`** — Trong transaction: trừ kho **đúng lô**, nhập lô thành phẩm mới, ghi **`batch_lineage`** (parent → child), giao dịch kho consume/output, xử lý chênh lệch yield (loss/surplus tương tự sản xuất chuẩn). Sản lượng thực tế gửi qua **`actualYield`**; trên DB có thể map vào **`actual_quantity`** của lệnh (không tách cột `actual_yield` riêng).

**Phân biệt với Standard:** `POST /production/orders/:id/start` dùng **FEFO**; salvage **không** dùng start/complete chuẩn cho cùng lệnh đó.

**Gợi ý UI:** Màn hình chọn **batch ID** rõ ràng; cảnh báo khi lô gần hết hạn; form nhập **actual yield** (số thực) và `surplusNote` khi vượt định mức lý thuyết.

---

## 2. Danh sách API mới & refactored (trọng tâm tích hợp)

### 2.1. Order (`/orders`)

| Method + Path | Role | Body / query quan trọng | Lưu ý UI |
|---------------|------|-------------------------|----------|
| `GET /orders/coordinator/:id/approval-suggestion` | Admin, **Supply Coordinator** | — | Hiển thị ATP, partial, mốc `safetyMinimumExpiryDate`; gọi trước `approve` |
| `PATCH /orders/coordinator/:id/approve` | Admin, SC | `ApproveOrderDto`: `force_approve?`, `price_acknowledged?`, `production_confirm?` | Partial fulfillment; cờ giá / bếp theo backend |
| `PATCH /orders/franchise/:id/confirm-price` | Admin, **Franchise Staff** | — | Gỡ khóa khi lệch giá snapshot vs catalog (workflow `pending_price_confirm`) |
| `PATCH /orders/kitchen/:id/production-confirm` | Admin, **Central Kitchen Staff** | `ProductionConfirmDto` | Phản hồi khi đơn cần xác nhận sản xuất bù |
| `PATCH /orders/coordinator/:id/force-cancel` | Admin, **Manager**, SC | — | Đơn đã duyệt / đang vận hành; có restock task |
| `GET /orders/analytics/fulfillment-rate` | Admin, **Manager** | `FulfillmentRateQueryDto` | Fill rate / không backorder |
| `GET /orders/analytics/performance/lead-time` | Admin, **Manager** | `SlaQueryDto` | SLA lead time |

Các endpoint danh sách / tạo đơn / review / reject / chi tiết vẫn dùng như Swagger; **ATP** và **approve flags** là phần cần đồng bộ màn SC + cửa hàng + bếp.

---

### 2.2. Warehouse / Logistics (`/warehouse`)

| Method + Path | Role | Body quan trọng | Lưu ý UI |
|---------------|------|-----------------|----------|
| **`POST /warehouse/manifest/consolidate`** | **Admin, Manager, Supply Coordinator** | `ConsolidateManifestDto`: `orderIds[]`, `vehicleId`, `driverName?` | Cùng route; kiểm kg vs xe; sau gọi đơn chuyển **picking** |
| `POST /warehouse/manifests` | **Central Kitchen Staff** | `CreateManifestDto` | Wave picking (kitchen tự gom) |
| `GET /warehouse/manifests/:id/picking-list` | Kitchen | — | Picking list gộp manifest |
| `PATCH /warehouse/manifests/:id/verify-item` | Kitchen | `VerifyManifestItemDto` | FEFO cứng khi quét |
| `POST /warehouse/manifests/:id/report-batch-issue` | Kitchen | `ReportManifestBatchIssueDto` | Đổi lô khi hỏng |
| `POST /warehouse/manifests/:id/depart` | Kitchen | — | Xuất kho theo manifest |
| `POST /warehouse/manifests/:id/cancel` | Kitchen | — | Hoàn reserve trước khi xuất |
| `PATCH /warehouse/shipments/finalize-bulk` | Kitchen | `FinalizeBulkShipmentDto` | Xuất gộp nhiều đơn (luồng cũ song song) |
| `GET /warehouse/picking-tasks`, `GET .../:id`, cancel/reset | Kitchen | — | Task **approved / picking** |

---

### 2.3. Shipments (`/shipments`) — Logistics cửa hàng & điều phối

| Method + Path | Role | Ghi chú |
|---------------|------|---------|
| `GET /shipments` | Manager, SC, Admin | Giám sát |
| `GET /shipments/store/my` | Franchise Staff | JWT `storeId` |
| `GET /shipments/:id/picking-list` | SC, Kitchen, Admin | Picking theo shipment |
| `GET /shipments/:id` | Nhiều role | Franchise chỉ chuyến của cửa mình |
| `PATCH /shipments/:id/receive-all` | Franchise Staff | Nhận nhanh |
| `POST /shipments/:id/receive` | Franchise Staff | `ReceiveShipmentDto` — thiếu/hỏng |

---

### 2.4. Production (`/production`)

| Method + Path | Role | Body | Lưu ý UI |
|---------------|------|------|----------|
| **`POST /production/salvage`** | **Manager, Central Kitchen Staff** | `CreateSalvageDto`: `inputBatchId`, `recipeId`, `quantityToConsume` | Kho = **central** (server tự resolve); BOM 1 NL |
| **`POST /production/salvage/:id/complete`** | Manager, Kitchen | `CompleteSalvageDto`: `actualYield`, `surplusNote?` | Role Manager có thể bypass ngưỡng surplus (logic service) |
| `GET /production/recipes`, `GET .../:id`, `POST/PATCH/DELETE recipes` | Manager, Kitchen, Admin (đọc) | BOM không còn `standardOutput` — xem `quantityPerOutput` |
| `POST /production/orders` | Manager, Kitchen | `CreateProductionOrderDto` | `production_type` mặc định **standard** |
| `POST /production/orders/:id/start` | Kitchen | — | **Không** dùng cho salvage |
| `POST /production/orders/:id/complete` | Kitchen | `CompleteProductionDto` | **Không** dùng cho salvage |
| `GET /production/orders`, `GET .../:id` | Manager, Kitchen, SC, Admin | — | Chi tiết có reservation / lineage / giao dịch |

---

### 2.5. Inventory (`/inventory`) — báo cáo & tồn

Các endpoint analytics (`/inventory/analytics/*`), tồn cửa hàng, batch theo sản phẩm, waste, financial loss-impact phục vụ dashboard. **ATP** không nằm ở đây mà ở **order approval-suggestion**.

---

## 3. Cấu trúc dữ liệu snapshot (Financial / Pricing)

Bảng **`order_items`** (API detail đơn thường trả về các field tương ứng):

| Cột (DB) | Ý nghĩa |
|----------|---------|
| `unit_price_at_order` | **Giá bán cho franchise tại thời điểm đặt** — snapshot tài chính, **không** thay đổi khi master product đổi giá sau này |
| `price_snapshot` | Snapshot giá liên quan (theo thiết kế đơn) |
| `unit_snapshot` | Đơn vị tại lúc đặt |
| `unit_cost_at_import` | Giá vốn đơn vị **chốt khi duyệt** (theo lô FEFO phân bổ) |

**Vì sao UI không được thay giá hiện tại của master product trên đơn đã đặt?**  
Đơn là **hợp đồng tại thời điểm đặt** + **đối soát lãi lỗ / khiếu nại**; dùng `unit_price_at_order` (và các snapshot khác) đảm bảo **báo cáo nhất quán** với backend và sổ tài chính.

---

## 4. Trạng thái đơn hàng & shipment

### 4.1. Order (`OrderStat`)

| Giá trị | Gợi ý nghĩa trên UI |
|---------|---------------------|
| `pending` | Chờ xử lý |
| `approved` | Đã duyệt, chờ gom chuyến / soạn |
| `picking` | Đang soạn (sau consolidate manifest hoặc luồng tương đương) |
| `delivering` | Đang giao |
| `completed` | Hoàn tất |
| `claimed` | Khiếu nại / claim (theo nghiệp vụ) |
| `rejected` | Từ chối |
| `cancelled` | Hủy |
| **`waiting_for_production`** | Chờ phối hợp sản xuất / xác nhận bếp trước khi đi tiếp luồng duyệt giao |

Cờ bổ sung trên đơn (schema): ví dụ **`pending_price_confirm`** — cần flow **confirm-price** từ cửa hàng.

### 4.2. Shipment (`ShipmentStatus`)

| Giá trị | Gợi ý |
|---------|--------|
| `preparing` | Phiếu giao đang chuẩn bị |
| **`consolidated`** | Đã gom vào manifest / chuyến |
| `in_transit` | Đang vận chuyển |
| `departed` | Đã xuất kho / rời kho (theo luồng manifest depart) |
| `delivered` | Đã giao |
| `completed` | Đóng chuyến |
| `cancelled` | Hủy |

Schema shipment còn có **`overload_warning`**, **`total_weight_kg`** — có thể hiển thị cảnh báo tải trọng trên màn điều phối.

---

## 5. Hướng dẫn test nhanh (UAT trên Swagger)

**Chuẩn bị:** JWT đủ role (SC, Manager, Kitchen, Franchise); có đơn `pending`/`approved`, cửa hàng đã gán **route**, sản phẩm có **`weight_kg`**, tồn kho trung tâm và lô thử nghiệm.

1. **ATP trước khi duyệt**  
   - `GET /wdp301-api/v1/orders/coordinator/{orderId}/approval-suggestion`  
   - Kiểm tra `safetyMinimumExpiryDate`, `lines[].atpAvailable` vs `suggestedApprove`, `summarySuggestion`.  
   - Sau đó `PATCH .../approve` với các cờ nếu backend yêu cầu.

2. **Manifest consolidation + chuyển picking**  
   - Chọn nhiều đơn **cùng route**, `approved`, chưa `shipment_id`.  
   - `POST /wdp301-api/v1/warehouse/manifest/consolidate` với `vehicleId` đủ payload.  
   - Xác nhận response có `manifestId`, đơn chuyển **`picking`**, shipment **`consolidated`**.  
   - Thử cố tình vượt tải hoặc khác route để thấy lỗi UI cần bắt.

3. **Salvage end-to-end**  
   - `POST /wdp301-api/v1/production/salvage` với lô còn hạn + recipe 1 NL khớp sản phẩm lô.  
   - `POST /wdp301-api/v1/production/salvage/{orderId}/complete` với `actualYield`.  
   - `GET /wdp301-api/v1/production/orders/{id}` kiểm tra lineage / giao dịch `PRODUCTION:*`.

---

## 6. Tech Lead Tips (gợi ý UX / kỹ thuật cho FE)

Các lưu ý ngắn để team Frontend xử lý **hiển thị** và **đồng bộ dữ liệu** cho khớp hành vi backend.

### 6.1. Đơn vị cân nặng (`weight_kg`)

Backend lưu **`weight_kg`** dạng số thập phân theo **kilogram** (ví dụ `0.200` = 200g, `1.2` = 1.2kg). Trên UI, nên có **một hàm format thống nhất** để đọc dễ:

| Quy tắc gợi ý | Ví dụ hiển thị |
|----------------|----------------|
| `< 1 kg` | Đổi sang **gram** (làm tròn hợp lý, ví dụ `200 g`) |
| `≥ 1 kg` | Giữ **kg** với số chữ số thập phân cố định (ví dụ `1.20 kg`) |

Ví dụ tham khảo (TypeScript — chỉnh theo i18n / design system của dự án):

```ts
/** weightKg: giá trị từ API (vd products.weight_kg) */
export function formatWeightKg(weightKg: number): string {
  if (!Number.isFinite(weightKg) || weightKg < 0) return '—';
  if (weightKg < 1) {
    const g = Math.round(weightKg * 1000);
    return `${g.toLocaleString('vi-VN')} g`;
  }
  return `${weightKg.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kg`;
}
```

Dùng chung cho catalog, picking, manifest (tổng khối lượng từng dòng = `quantity_approved × weight_kg`) để tránh chỗ hiển thị `0.2`, chỗ hiển thị `200` không đồng nhất.

### 6.2. Progress Bar tải trọng xe (Manifest)

Khi **Coordinator** đang tick chọn nhiều đơn trước khi gọi `POST /warehouse/manifest/consolidate`, nên có **thanh tiến trình** phản ánh **% đã dùng payload** so với xe đang chọn:

- Công thức gợi ý: `percent = (tổngKgĐãChọn / vehicle.payload_capacity) × 100`, clamp 0–100 (và có thể **> 100** với màu cảnh báo nếu cho phép chọn vượt trước khi submit — backend vẫn sẽ reject).
- Copy mẫu: **`Xe 51K-500KG: Đã chọn 450 kg (90%)`** — giúp SC thấy ngay **còn bao nhiêu “room”** trước khi bị lỗi `Vehicle overload`.

Kết hợp với bảng đơn đã chọn và `formatWeightKg` ở trên để đồng bộ số liệu trên UI với cách backend tính (Σ `quantity_approved × weight_kg`).

### 6.3. Tồn khả dụng / ATP sau khi Approve (Reserved Quantity)

Hệ thống có cơ chế **giữ chỗ tồn** (tăng **`reserved_quantity`**, lock batch khi salvage, v.v.). Sau khi **SC nhấn Approve** trên một đơn, phần tồn tương ứng **không còn “khả dụng”** cho các đơn / màn hình khác đang mở.

**Gợi ý cho FE:**

- Sau khi approve thành công: **refetch** danh sách đơn, màn review, hoặc `approval-suggestion` / tồn nếu đang mở song song.
- Nếu không refetch tự động: hiển thị **toast / banner** kiểu *“Tồn khả dụng có thể đã thay đổi do đơn khác vừa được duyệt — vui lòng làm mới.”*
- Các màn so sánh ATP giữa nhiều tab trình duyệt luôn coi là **eventually consistent** với server; không cache ATP quá lâu mà không invalidate.

---

*Tài liệu căn cứ mã nguồn tại thời điểm biên soạn (`order`, `warehouse`, `shipment`, `production`, `inventory`, `schema`). Nếu Swagger mô tả khác, ưu tiên **Swagger + response thực tế** sau khi deploy.*
