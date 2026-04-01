# PRODUCT Module — Master Data & Batch Definition

**Project:** SP26SWP07  
**Core idea:** **`products`** define the catalog template (SKU, shelf life, UoM); **`batches`** carry **quantity, expiry, and traceability**. Stock lives in **`inventory`** per `(warehouse_id, batch_id)`.

---

## 1. Architecture

### 1.1 Product

- Master record: `sku`, `name`, **`type`** (`product_type`: `raw_material` | `finished_good` | `resell_product`), `baseUnitId`, `shelfLifeDays`, `minStockLevel`, `minShelfLife` (safety buffer vs expiry), pricing, packaging, weight/volume, `prepTimeHours`, flags (`isActive`, `isHighValue`).
- **`type` (nghiệp vụ):** `raw_material` — chỉ dùng trong bếp / BOM / tồn NL; **không** xuất hiện trên catalog đặt hàng franchise. `finished_good` / `resell_product` — được đặt qua đơn cửa hàng (và hiển thị trên `GET /orders/catalog`).
- **No on-hand quantity** on the product row — quantities are aggregated from batches/inventory.

### 1.2 Base unit

- Normalized UoM table (`base_units`) referenced by `products.base_unit_id`.
- Managed under `product/base-unit` routes (`BaseUnitController`).
- **Danh sách:** `GET /base-units` dùng query `GetBaseUnitsDto` (phân trang `page` / `limit` **mặc định** trong repository nếu client không gửi — tránh tải full bảng), tùy chọn `search`, `isActive`, `sortBy`, `sortOrder`.

### 1.3 Batch

- Child of product: `batch_code`, `manufactured_date`, `expiry_date`, `status`, optional `image_url`, denormalized quantity fields (kept in sync with inventory in other flows).
- **This is the object** planners pick for FEFO and shipments.

```text
base_units (1) ──► products (N)
products (1) ──► batches (N)
batches (1) ──► inventory (N) per warehouse
```

---

## 2. SKU & batch code generation

### 2.1 Product SKU — `SkuUtil` (`src/common/utils/generate-product-sku.util.ts`)

- Format: **`P-{NAME_ABBREV}-{RANDOM6}`**  
  Example pattern: `P-GRTT-X7K2M1` (abbreviation from normalized Vietnamese name, random alphanumeric suffix).
- **Collision handling:** `ProductService.createProduct` regenerates path would throw `ConflictException` if SKU exists — in practice the random suffix makes collisions rare; retry logic could be added.

### 2.2 Batch code — `generateBatchCode` (`src/common/utils/generate-batch-code.util.ts`)

- Format: **`{SKU_UPPER}-{YYYYMMDD}-{RAND4}`**  
  Example: `P-GRTT-X7K2M1-20260331-A1B2`
- Used inside `ProductService.createBatch` when inbound (or internal flows) create a new lot.

### 2.3 Programmatic batch creation

- **`ProductService.createBatch(productId, imageUrl?, explicitExpiryDate?)`** computes `manufacturedDate` / `expiryDate` from `shelfLifeDays` or explicit expiry, generates `batchCode`, inserts batch.
- **Not exposed** as a dedicated `POST /products/.../batches` in `product.controller.ts` in the current codebase — creation is invoked from **inbound/receipt** (and similar) flows. Use this service method when adding a public API.

---

## 3. API specification (`ProductController` + `BaseUnitController`)

Global guards: `AtGuard`, `RolesGuard`.

### 3.1 Products

| Method & path | Roles | Description |
|---------------|-------|-------------|
| `POST /products` | `manager` | Create product; SKU auto-generated. Body có thể gửi **`type`** (mặc định server thường là `raw_material` nếu không gửi — đối chiếu DTO/Swagger). |
| `GET /products` | `manager`, `franchise_store_staff`, `central_kitchen_staff`, `supply_coordinator` | List + pagination. |
| `GET /products/:id` | same read roles | Detail (includes batch relation per repository). |
| `PATCH /products/:id` | `manager` | Update. |
| `DELETE /products/:id` | `manager` | Soft delete. |
| `PATCH /products/:id/restore` | `manager` | Restore. |

**Query (`GetProductsDto` / `ProductFilterDto`):** `page`, `limit`, `sortBy`, `sortOrder`, optional `isActive`, `search` (name/SKU), **`type`** (lọc theo `product_type`).

> **Note**  
> There is **no** `category` or `supplier` filter on products in `GetProductsDto` today — the schema links suppliers via **receipts**, not a direct `product.supplier_id`. Add filters if the domain requires them.

### 3.2 Batches (under products controller)

| Method & path | Roles | Description |
|---------------|-------|-------------|
| `GET /products/batches` | `manager`, `central_kitchen_staff`, `supply_coordinator`, `franchise_store_staff` | List batches (`GetBatchesDto`). |
| `GET /products/batches/:id` | same | Batch detail. |
| `PATCH /products/batches/:id` | `manager`, `central_kitchen_staff`, `supply_coordinator` | Update batch metadata / initial quantity path (`UpdateBatchDto`). |

> **Warning**  
> Nest route order: `GET /products/batches` must be declared **before** `GET /products/:id` so `batches` is not parsed as an `:id` — already done in `product.controller.ts`.

### 3.3 Base units (`BaseUnitController`)

| Method & path | Typical roles | Description |
|---------------|---------------|-------------|
| CRUD under module-configured path | `manager` (per controller decorators) | Maintain UoM catalog. |

(See `base-unit/base-unit.controller.ts` for exact paths.)

---

## 4. Note for AI IDE (Cursor) — stock and expiry

When answering questions about **“how much stock”** or **“what expires first”**:

- **Do not** stop at `products`.
- **Join** `batches` (for `expiry_date`, `batch_code`, `status`) and **`inventory`** for warehouse-specific quantities.
- FEFO sorting example exists in `ShipmentService.getShipmentDetail` (sort items by `batch.expiryDate`).

---

## 5. Frontend guide

### 5.1 Product list with total stock

1. For each product, either:
   - Use an API that returns aggregates (if you add one), or
   - Fetch batches (`GET /products/batches?productId=...`) and **sum** `quantity` from nested inventory if the API returns it, or call inventory endpoints per warehouse.

### 5.2 Near-expiry warning

- Compare `expiry_date` of active batches to **today + `minShelfLife`** (product-level buffer) to flag “do not ship / promote / waste risk”.

---

## 6. File map

| File | Role |
|------|------|
| `product.controller.ts` | HTTP routes |
| `product.service.ts` | SKU generation, batch helper `createBatch`, CRUD |
| `product.repository.ts` | DB access |
| `dto/get-products.dto.ts`, `product-filter.dto.ts`, `get-batches.dto.ts` | Filters + phân trang |
| `base-unit/dto/get-base-units.dto.ts` | Query danh sách đơn vị + phân trang |
| `src/common/utils/generate-product-sku.util.ts` | SKU algorithm |
| `src/common/utils/generate-batch-code.util.ts` | Batch code algorithm |
