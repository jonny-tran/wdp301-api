# FRONTEND API INTEGRATION GUIDE

> **Dự án:** Central Kitchen & Franchise Supply Chain (KFC Model) — **SP26SWP07**  
> **Phiên bản tài liệu:** v3.0 — Cập nhật **2026-03-31**  
> **Nguồn đối chiếu:** Controllers/DTOs trong `src/module`, `src/database/schema.ts`, và các file hướng dẫn nội bộ (xem §0.2).

---

## 0. Bắt đầu nhanh

### 0.1 Base URL, versioning & Swagger

- **Global prefix:** `wdp301-api` (khai báo trong `src/main.ts`).
- **URI versioning:** `defaultVersion: '1'` → đường dẫn đầy đủ thường là:

  `http(s)://<host>:<port>/wdp301-api/v1/<resource>`

  Ví dụ: `POST /wdp301-api/v1/auth/login`

- **Swagger UI:** `http(s)://<host>:<port>/wdp301-api/docs`

> Luôn mở Swagger để xác nhận path thực tế sau khi deploy (port, proxy nginx, v.v.).

### 0.2 Tài liệu chi tiết theo module (đã đồng bộ nội dung v3.0)

| Chủ đề | File |
|--------|------|
| Auth, JWT, refresh, RBAC, store isolation, `@CurrentUser()` | `src/module/auth/AUTH_GUIDE.md` |
| Claim / sai lệch / traceability | `src/module/claim/CLAIM_LOGIC.md` |
| Store + warehouse nội bộ | `src/module/franchise-store/STORE_MANAGEMENT.md` |
| Product, SKU, batch code, API sản phẩm & lô | `src/module/product/PRODUCT_MASTER_DATA.md` |
| Shipment, receive, claim tự động | `src/module/shipment/SHIPMENT_GUIDE.md` |
| Supplier | `src/module/supplier/SUPPLIER_MANAGEMENT.md` |
| Enum & field logic DB | `src/database/SCHEMA_DEFINITION.md` |

### 0.3 Quy ước dữ liệu

- Request/Response JSON: **camelCase** theo DTO NestJS.
- Dữ liệu từ DB (Drizzle) có thể là **snake_case** ở một số chỗ — FE nên kiểm tra payload thực tế hoặc chuẩn hóa ở lớp API client.
- **Nguyên tắc nghiệp vụ (tóm tắt):**
  - **Batch-centric:** mọi xuất/nhận gắn **`batchId`**; FEFO dựa trên **`expiryDate`** của lô.
  - **Store isolation:** `franchise_store_staff` phải dùng **`storeId` từ JWT**; không tin `storeId` gửi từ client nếu đã có endpoint “my-store” / filter ép từ server.
  - **Partial fulfillment:** `quantity_requested` vs `quantity_approved` trên order line — không backorder (xem `ORD-OPTIMIZE.md` / service order).

---

## MỤC LỤC

1. [Global Response Wrapper](#1-global-response-wrapper)
2. [Enum & hằng số](#2-enum--hằng-số)
3. [Phân trang](#3-phân-trang-pagination)
4. [Tích hợp Auth (FE)](#4-tích-hợp-auth-fe)
5. [Module: Authentication](#5-module-authentication)
6. [Module: Franchise Store](#6-module-franchise-store)
7. [Module: Supplier](#7-module-supplier)
8. [Module: Product & Batch](#8-module-product--batch)
9. [Module: Base units](#9-module-base-units)
10. [Module: Inbound Logistics](#10-module-inbound-logistics)
11. [Module: Inventory](#11-module-inventory)
12. [Module: Order](#12-module-order)
13. [Module: Production](#13-module-production)
14. [Module: Warehouse Operation](#14-module-warehouse-operation)
15. [Module: Shipment](#15-module-shipment)
16. [Module: Claim](#16-module-claim)
17. [Module: System Config](#17-module-system-config)
18. [Module: Upload (Cloudinary)](#18-module-upload-cloudinary)
19. [Luồng nghiệp vụ (Frontend flows)](#19-luồng-nghiệp-vụ-frontend-flows)

---

## 1. Global Response Wrapper

`TransformInterceptor` bọc response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": "<payload>",
  "timestamp": "2026-03-31T00:00:00.000Z",
  "path": "/wdp301-api/v1/..."
}
```

- Một số handler dùng `@ResponseMessage(...)` — `message` có thể khác `"Success"`.
- **Lỗi validation (400):** có thể có cấu trúc `errors[]` (field + message) từ `ValidationPipe`.

**Phân trang** — `data` thường có dạng:

```json
{
  "items": [],
  "meta": {
    "totalItems": 50,
    "itemCount": 10,
    "itemsPerPage": 10,
    "totalPages": 5,
    "currentPage": 1
  }
}
```

> Không dùng `total` / `page` trong `meta` trừ khi endpoint cụ thể trả khác — chuẩn repo là các field trên (`PaginatedResponse`).

---

## 2. Enum & hằng số

### UserRole

`admin` | `manager` | `supply_coordinator` | `central_kitchen_staff` | `franchise_store_staff`

### OrderStatus

`pending` | `approved` | `rejected` | `cancelled` | `picking` | `delivering` | `completed` | `claimed` | **`waiting_for_production`**

> `waiting_for_production`: đơn/line phụ thuộc sản xuất bù — cần xử lý UI riêng (xem `SCHEMA_DEFINITION.md`).

### ShipmentStatus

`preparing` | `in_transit` | `delivered` | `completed` | **`cancelled`**

### ClaimStatus

`pending` | `approved` | `rejected`  
(UI có thể hiển thị `approved` như “đã xử lý / chấp nhận”.)

### ReceiptStatus

`draft` | `completed` | `cancelled`

### BatchStatus

`pending` | `available` | `empty` | `expired` | **`active`** | **`damaged`**

### TransactionType (inventory_transactions)

`import` | `export` | `waste` | `adjustment` | `production_consume` | `production_output` | **`reservation`** | **`release`** | **`adjust_loss`** | **`adjust_surplus`**

> Nhận hàng từ shipment vào kho store: backend ghi **`import`** (xem `SHIPMENT_GUIDE.md`).

### Manifest / Picking list (tham chiếu schema)

- `manifest_status`: `preparing` | `departed` | `cancelled`
- `picking_list_status`: `open` | `picking` | `staged` | `completed`

---

## 3. Phân trang (Pagination)

Query chung (`PaginationParamsDto`):

| Param       | Type            | Default | Mô tả        |
| ----------- | --------------- | ------- | ------------ |
| `page`      | number          | 1       | ≥ 1          |
| `limit`     | number          | 10      | ≥ 1          |
| `sortBy`    | string          | —       | Tùy bảng/API |
| `sortOrder` | `ASC` \| `DESC` | `DESC`  |              |

---

## 4. Tích hợp Auth (FE)

1. **Lưu token:** access (ngắn hạn, ưu tiên memory); refresh (bảo mật — cookie httpOnly nếu có).
2. **Header:** `Authorization: Bearer <accessToken>`.
3. **401:** thử một lần `POST .../auth/refresh-token`; thất bại → xóa token, redirect login.
4. **Sau login:** điều hướng theo `role` + `storeId` (xem `AUTH_GUIDE.md`).

---

## 5. Module: Authentication

**Base path:** `/auth` (thêm prefix + version như §0.1)

| Method & path | Roles / Guard | Ghi chú |
| ------------- | ------------- | ------- |
| `POST /auth/login` | Public, throttle | Body: `email`, `password` |
| `POST /auth/refresh-token` | Public, throttle | Body: `refreshToken` |
| `GET /auth/me` | `AtGuard` | Profile |
| `POST /auth/logout` | `AtGuard` | Body: `refreshToken` |
| `PATCH /auth/profile` | `AtGuard` | `UpdateProfileDto` |
| `POST /auth/create-user` | Admin | Không có self-register công khai |
| `POST /auth/forgot-password` | Public, throttle | |
| `POST /auth/reset-password` | Public, throttle | |
| `GET /auth/roles` | Admin | |
| `GET /auth/users` | Admin | Query: `GetUsersDto` |
| `PATCH /auth/users/:id` | Admin | `UpdateUserByAdminDto` |

**Login response (`data`):** `userId`, `email`, `username`, `role`, `storeId`, `accessToken`, `refreshToken`  
**Refresh response:** `accessToken`, `refreshToken`

---

## 6. Module: Franchise Store

**Base path:** `/stores`

| Method & path | Roles |
| ------------- | ----- |
| `POST /stores` | `manager` |
| `GET /stores` | **`admin`**, `manager`, `supply_coordinator` |
| `GET /stores/:id` | `manager` |
| `PATCH /stores/:id` | `manager` |
| `DELETE /stores/:id` | `manager` (soft deactivate) |
| `GET /stores/analytics/reliability` | `manager` |
| `GET /stores/analytics/demand-pattern` | `manager` |

Tạo store đồng thời tạo **kho `store_internal`** mặc định (xem `STORE_MANAGEMENT.md`).

**Dashboard tổng hợp:** chưa có một API đơn lẻ — ghép từ **orders**, **shipments/store/my**, **claims/my-store**.

---

## 7. Module: Supplier

**Base path:** `/suppliers`

| Method & path | Roles |
| ------------- | ----- |
| `GET /suppliers` | Authenticated |
| `GET /suppliers/:id` | Authenticated — kèm tối đa **5 receipt** gần nhất |
| `POST /suppliers` | **`manager`** |
| `PATCH /suppliers/:id` | **`manager`** |
| `DELETE /suppliers/:id` | **`manager`** (soft) |

Query list: `search`, `isActive`, pagination. Schema **không** có cột `code` riêng cho NCC — xem `SUPPLIER_MANAGEMENT.md`.

---

## 8. Module: Product & Batch

**Base path:** `/products` — toàn bộ: `AtGuard` + `RolesGuard`

### Sản phẩm

| Method & path | Roles (tóm tắt) |
| ------------- | ----------------- |
| `POST /products` | `manager` |
| `GET /products` | `manager`, **`franchise_store_staff`**, **`central_kitchen_staff`**, **`supply_coordinator`** |
| `GET /products/:id` | Cùng nhóm đọc |
| `PATCH /products/:id`, `DELETE`, `PATCH .../restore` | `manager` |

**CreateProductDto (bắt buộc chính):** `name`, `baseUnitId`, `shelfLifeDays`, `imageUrl` — **SKU auto** (`P-{abbrev}-{random}`), không gửi SKU từ FE.

**Query `GetProductsDto`:** `search`, `isActive`, pagination — **chưa** có filter category/supplier trên DTO hiện tại.

### Lô (batches) — **thứ tự route**

| Method & path | Roles |
| ------------- | ----- |
| `GET /products/batches` | `manager`, `central_kitchen_staff`, `supply_coordinator`, `franchise_store_staff` |
| `GET /products/batches/:id` | Cùng nhóm |
| `PATCH /products/batches/:id` | `manager`, `central_kitchen_staff`, `supply_coordinator` |

**Query `GetBatchesDto`:** `search`, `productId`, `supplierId`, `fromDate`, `toDate`, pagination.

**Tạo batch “mở đầu dòng chảy”:** logic `ProductService.createBatch` — chủ yếu gọi từ **inbound**; không có `POST /products/.../batches` public trên controller (xem `PRODUCT_MASTER_DATA.md`).

---

## 9. Module: Base units

**Base path:** `/base-units` — CRUD chủ yếu **`manager`** (xem `base-unit/base-unit.controller.ts`).

---

## 10. Module: Inbound Logistics

**Base path:** `/inbound` — `central_kitchen_staff` (+ auth guards)

Các endpoint chính (giữ nguyên luồng tài liệu cũ nếu đã triển khai): tạo phiếu draft → thêm dòng → hoàn tất → cộng kho; in tem QR; reprint. Chi tiết payload xem Swagger / `INB-OPTIMIZE.md`.

---

## 11. Module: Inventory

**Base path:** `/inventory`

Các nhóm endpoint (store inventory, transactions, summary, low-stock, kitchen summary, analytics, adjust) như phiên bản trước — **đối chiếu Swagger** để lấy đúng `@Roles` từng route.

**Gợi ý FE:** tồn kho theo **lô + HSD** — join batch/expiry từ API trả về; không chỉ nhìn master product.

---

## 12. Module: Order

**Base path:** `/orders`

| Method & path | Roles | Mô tả ngắn |
| ------------- | ----- | ---------- |
| `GET /orders` | Manager, coordinator, **admin**, **franchise_store_staff** | Lọc phân trang; staff thường bị giới hạn theo store ở tầng service — ưu tiên dùng `my-store` |
| `POST /orders` | `franchise_store_staff`, `admin` | Tạo đơn |
| `GET /orders/catalog` | Nhiều role (xem controller) | Catalog; có thể set `isActive=true` server-side |
| `GET /orders/my-store` | `franchise_store_staff`, `admin` | **storeId** gán từ JWT |
| `PATCH /orders/franchise/:id/cancel` | Franchise staff, admin | Hủy khi còn `pending` |
| `GET /orders/coordinator/:id/review` | Coordinator, admin | So sánh tồn |
| `PATCH /orders/coordinator/:id/approve` | Coordinator, admin | Partial approve — body bên dưới |
| `PATCH /orders/coordinator/:id/reject` | Coordinator, admin | |
| `PATCH /orders/coordinator/:id/force-cancel` | Coordinator, **manager**, admin | Hủy bắt buộc / giải phóng reserve |
| `PATCH /orders/franchise/:id/confirm-price` | Franchise staff, admin | Xác nhận khi lệch giá >20% |
| `PATCH /orders/kitchen/:id/production-confirm` | **Central kitchen**, admin | Xác nhận sản xuất bù / từ chối |
| `GET /orders/:id` | Coordinator, staff, manager, admin | Chi tiết + kiểm tra quyền store |
| `GET /orders/analytics/fulfillment-rate` | Manager, admin | |
| `GET /orders/analytics/performance/lead-time` | Manager, admin | |

**ApproveOrderDto**

| Field | Ý nghĩa |
| ----- | ------- |
| `force_approve` | Bắt buộc khi fill rate quá thấp (logic service) |
| `price_acknowledged` | Đã xử lý cảnh báo giá catalog vs snapshot |
| `production_confirm` | Đã phối hợp bếp khi thiếu hàng / chờ sản xuất |

Chi tiết **partial fulfillment**, **waiting_for_production**: `ORD-OPTIMIZE.md` + `order.service.ts`.

---

## 13. Module: Production

**Base path:** `/production`

| Method & path | Roles |
| ------------- | ----- |
| `POST /production/recipes` | `manager`, `central_kitchen_staff` |
| `POST /production/orders` | `central_kitchen_staff`, `manager` |
| `POST /production/orders/:id/start` | `central_kitchen_staff` |
| `POST /production/orders/:id/complete` | `central_kitchen_staff` |

Luồng: tạo lệnh draft → **start** (reserve nguyên liệu FEFO) → **complete** (nhập lô thành phẩm, lineage). Xem `PROD-LOGIC-FINAL.md`.

---

## 14. Module: Warehouse Operation

**Base path:** `/warehouse` — `central_kitchen_staff`

- `GET /warehouse/picking-tasks` — danh sách đơn cần soạn (phân trang).
- `GET /warehouse/picking-tasks/:id` — gợi ý lô **FEFO**.
- `PATCH /warehouse/picking-tasks/:orderId/reset`
- `PATCH /warehouse/shipments/finalize-bulk` — xuất kho / chuyển trạng thái vận chuyển (theo `WH_OPTIMIZE_FLOW.md`).
- `GET /warehouse/shipments/:id/label` — dữ liệu in phiếu.
- `GET /warehouse/scan-check?batchCode=...`
- `POST /warehouse/batch/report-issue`
- Các endpoint manifest / verify (nếu có trên controller) — xem Swagger.

---

## 15. Module: Shipment

**Base path:** `/shipments`

| Method & path | Roles | Ghi chú |
| ------------- | ----- | ------- |
| `GET /shipments` | **`manager`**, **`supply_coordinator`**, **`admin`** | Query: `GetShipmentsDto` (`status`, `storeId`, `search`, dates, pagination) |
| `GET /shipments/store/my` | **`franchise_store_staff`** | **Luôn** filter `storeId` từ JWT |
| `GET /shipments/:id/picking-list` | Coordinator, **central_kitchen_staff**, admin | Cho kho quét/soạn |
| `GET /shipments/:id` | Authenticated + kiểm tra quyền | Items sắp xếp theo **expiry ASC** |
| `PATCH /shipments/:id/receive-all` | `franchise_store_staff` | Nhận đủ — body rỗng |
| `POST /shipments/:id/receive` | `franchise_store_staff` | `ReceiveShipmentDto` |

**Receive:** chỉ khi shipment **`in_transit`**. Cộng kho phần **tốt**; thiếu/hỏng → **claim tự động** + order có thể **`claimed`**. Giao dịch kho: type **`import`**.

**ReceiveShipmentDto**

- `items[]` (optional): `batchId`, `actualQty`, `damagedQty`, `evidenceUrls[]?`
- `notes?`

Response kiểu: `message`, `shipmentId`, `status: "completed"`, `hasDiscrepancy`, `claimId`.

---

## 16. Module: Claim

**Base path:** `/claims` — `AtGuard` + `RolesGuard`

| Method & path | Roles |
| ------------- | ----- |
| `POST /claims` | `franchise_store_staff`, `admin` | **Manual claim** |
| `GET /claims` | **`manager`**, **`supply_coordinator`**, **`admin`** | **Không** dùng cho staff thường |
| `GET /claims/my-store` | **`franchise_store_staff`** | Staff xem khiếu nại cửa hàng |
| `GET /claims/:id` | Staff (store-scoped), coordinator, manager, admin | |
| `PATCH /claims/:id/resolve` | Coordinator, manager, admin | `status`: `approved` \| `rejected` |
| `GET /claims/analytics/summary` | Manager, admin | |

**CreateManualClaimDto**

- `shipmentId` (UUID), `description?`, `items[]`:
  - `batchId`, `quantityMissing`, `quantityDamaged`, `reason?`, `imageProofUrl?`
- **Không** gửi `productId` trên DTO — server suy ra từ `batchId`.
- Nếu `quantityDamaged > 0` → **bắt buộc** `imageProofUrl` + `reason` (validate service).
- Điều kiện: shipment **`completed`**, đúng store, trong **24h** kể từ cập nhật hoàn thành — xem `CLAIM_LOGIC.md`.

**ResolveClaimDto:** `resolutionNote` hiện có thể **chưa được persist** — chỉ `status` + `resolvedAt` (xem `CLAIM_LOGIC.md`).

---

## 17. Module: System Config

**Base path:** `/system-configs` — `admin`

- `GET /system-configs`
- `PATCH /system-configs/:key` — `value`, `description?`

Keys ví dụ: `ORDER_CLOSING_TIME`, `FEFO_STRICT_MODE`, …

---

## 18. Module: Upload (Cloudinary)

**Base path:** `/upload` — kiểm tra controller hiện tại (auth public hay có guard); upload `multipart/form-data`, field `file`.

Dùng URL trả về làm `imageUrl` / `evidenceUrls` / `imageProofUrl`.

---

## 19. Luồng nghiệp vụ (Frontend flows)

### 19.1 Đặt hàng → duyệt → xuất kho → giao → nhận (happy path)

1. Staff: `GET /orders/catalog` → `POST /orders`
2. Coordinator: `GET /orders/coordinator/:id/review` → `PATCH .../approve` (có thể cần `force_approve`, `price_acknowledged`, `production_confirm`)
3. Kitchen: `GET /warehouse/picking-tasks` → detail → `PATCH /warehouse/shipments/finalize-bulk`
4. Staff: `GET /shipments/store/my?status=in_transit` → `PATCH .../receive-all` hoặc `POST .../receive`

### 19.2 Nhận hàng có sai lệch

`POST /shipments/:id/receive` với `actualQty` / `damagedQty` → hệ thống tạo **claim**, `hasDiscrepancy: true`.

### 19.3 Khiếu nại thủ công (sau receive)

Trong cửa sổ 24h, shipment đã `completed`: `POST /claims` với **`batchId`** + bằng chứng nếu hỏng.

### 19.4 Partial fulfillment / chờ sản xuất

- Sau approve có thể `quantity_approved < quantity_requested`.
- Order có thể vào **`waiting_for_production`** — hiển thị trạng thái riêng; phối hợp `PATCH /orders/kitchen/:id/production-confirm` và module **production**.

---

> **Tài liệu này tổng hợp từ source code và các file `*_GUIDE.md` / `SCHEMA_DEFINITION.md`.**  
> Khi có thay đổi controller, ưu tiên **Swagger** làm nguồn sự thật tức thời; cập nhật lại file này khi phát hành API mới.
