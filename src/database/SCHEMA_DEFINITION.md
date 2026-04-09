# Database Schema Definition

**Project:** Central Kitchen & Franchise Supply System (KFC-style model)  
**Course code:** SP26SWP07  
**Source:** `src/database/schema.ts` (Drizzle ORM / PostgreSQL)

This document explains PostgreSQL enums (statuses and types) and the most important logical fields on core supply-chain tables. It maps schema design to operational rules: batch-centric inventory, FEFO picking, partial fulfillment, and discrepancy handling.

---

## 1. Enums (Statuses & Types)

Each table below lists: **Enum name** (PostgreSQL type), **Value**, and **Business meaning** in the central kitchen ↔ franchise flow.

### 1.1 `role`

| Value | Business meaning |
|-------|------------------|
| `admin` | Full system administration. |
| `manager` | Approvals, overrides (e.g. variance, sensitive adjustments). |
| `supply_coordinator` | Plans supply, coordinates orders, shipments, and consolidation. |
| `central_kitchen_staff` | Production, receipts, central warehouse operations. |
| `franchise_store_staff` | Store-side ordering, receiving, and local claims context. |

### 1.2 `user_status`

| Value | Business meaning |
|-------|------------------|
| `active` | User may authenticate and act within their role. |
| `banned` | User is blocked; no normal operational access. |

> **Note**  
> The `users` table also exposes a separate `status` column (`varchar`, e.g. `ACTIVE`) for API compatibility. Prefer the enum-backed flows in application logic where `user_status` is used.

### 1.3 `warehouse_type`

| Value | Business meaning |
|-------|------------------|
| `central` | Central kitchen / hub warehouse (inbound supply, production, outbound to stores). |
| `store_internal` | Franchise store internal stock location. |

### 1.4 `order_status`

| Value | Business meaning |
|-------|------------------|
| `pending` | Order submitted; not yet approved for fulfillment. |
| `coordinating` | Order is in Coordination Hub inquiry/allocation window; temporarily locked for coordinator-kitchen decisioning. |
| `approved` | Approved for planning: stock reservation / picking / production can proceed. |
| `rejected` | Rejected by coordinator or manager; no fulfillment. |
| `cancelled` | Cancelled before or during lifecycle; must release reservations as per business rules. |
| `picking` | Allocation and pick in progress at source warehouse. |
| `delivering` | Goods in transit toward the store (linked to shipment lifecycle). |
| `completed` | Delivered and closed successfully from a supply perspective. |
| `claimed` | Post-delivery issues formalized via **claims** (see §3.6). |
| `waiting_for_production` | Demand cannot be fully covered from available batches; order (or line) waits until **production** creates output batches—avoids leaving the order in a false “approved but unstoppable” state. |

> **Warning**  
> `waiting_for_production` is a first-class state: it encodes **supply dependency on the production schedule**, not merely a delay. Downstream UIs and APIs should treat it distinctly from generic `pending`.

### 1.5 `shipment_status`

| Value | Business meaning |
|-------|------------------|
| `preparing` | Shipment created; picking / staging / loading not finished. |
| `consolidated` | Orders grouped into a manifest leg; ready for dispatch planning / load confirmation. |
| `in_transit` | Vehicle leg started; goods moving to destination warehouse. |
| `departed` | Trip departed (aligned with manifest-style accountability); use with logistics timestamps as needed. |
| `delivered` | Arrival acknowledged at destination (handover point). |
| `completed` | Shipment fully closed (quantities, documents, optional claim window handled per policy). |
| `cancelled` | Shipment voided; inventory and order links must be reconciled in application logic. |

### 1.6 `transaction_type` (`inventory_transactions`)

> **Code:** Drizzle export `transactionTypeEnum` (PostgreSQL `transaction_type`).

| Value | Business meaning |
|-------|------------------|
| `import` | Inbound stock increase (e.g. receipt finalized). |
| `export` | Outbound stock decrease (e.g. shipment confirmation). |
| `waste` | Destruction / spoilage removal from sellable stock. |
| `adjustment` | Generic correction (legacy or umbrella; prefer specific adjust types when possible). |
| `production_consume` | Ingredients deducted for a production run. |
| `production_output` | Finished goods added from production. |
| `reservation` | Soft lock for an order or production: **available ↓, reserved ↑** (batch/warehouse level). |
| `release` | Undo reservation on cancel/error: **reserved ↓, available ↑**. |
| `adjust_loss` | Approved shrinkage (theft, unrecorded loss). |
| `adjust_surplus` | Approved surplus (cycle count gain). |
| `transfer_out` | Inter-store transfer: stock leaves source store warehouse. |
| `transfer_in` | Inter-store transfer: stock enters destination store warehouse. |

### 1.6a `waste_reason` (`inventory_transactions.waste_reason`)

| Value | Business meaning |
|-------|------------------|
| `expired` | Past usable life / policy. |
| `damaged` | Physical damage; not saleable. |
| `quality_fail` | QC failure. |
| `production_loss` | Yield loss during production. |

### 1.7 `claim_status`

| Value | Business meaning |
|-------|------------------|
| `pending` | Store submitted discrepancy; awaiting central review. |
| `approved` | Credit / redo / write-off path accepted per policy. |
| `rejected` | Claim denied with audit trail. |

### 1.8 `receipt_status`

| Value | Business meaning |
|-------|------------------|
| `draft` | Receipt editable; batches/inventory not final. |
| `completed` | Posted; inventory and batches updated. |
| `cancelled` | Receipt voided. |

### 1.9 `batch_status`

| Value | Business meaning |
|-------|------------------|
| `pending` | Batch record exists but not yet available for sale/pick (e.g. QC, paperwork). |
| `available` | Eligible for allocation subject to FEFO and shelf-life rules. |
| `empty` | Physical quantity exhausted; batch row kept for traceability. |
| `expired` | Past usable expiry; must not be picked for fulfillment. |
| `active` | Operational batch participating in FEFO-style allocation. |
| `damaged` | Unfit for use; excluded from normal picking. |

### 1.10 `manifest_status`

| Value | Business meaning |
|-------|------------------|
| `preparing` | Trip/manifest open; shipments may still be attached. |
| `departed` | Vehicle left; in-transit accountability starts. |
| `cancelled` | Manifest cancelled; shipments need reassignment or rollback per rules. |

### 1.11 `picking_list_status`

| Value | Business meaning |
|-------|------------------|
| `open` | Pick list created for a manifest; work not started. |
| `picking` | Pickers actively collecting product. |
| `staged` | Picked goods staged for loadout. |
| `completed` | Picking closed; ready for dispatch alignment. |

### 1.12 `production_order_status`

| Value | Business meaning |
|-------|------------------|
| `draft` | Planned run; no material consumption yet. |
| `pending` | Coordination-triggered production request awaiting kitchen start; linked with `reference_id` / `note`. |
| `in_progress` | Kitchen executing; ingredients reserved/consumed per implementation. |
| `completed` | Output recorded; child batches and lineage can be finalized. |
| `cancelled` | Run aborted; release ingredient reservations. |

### 1.13 `inventory_adjustment_ticket_status`

| Value | Business meaning |
|-------|------------------|
| `pending` | Adjustment requested; needs manager approval. |
| `approved` | Posted to inventory / transactions. |
| `rejected` | No stock change. |

### 1.14 `product_type`

| Value | Business meaning |
|-------|------------------|
| `raw_material` | Nguyên liệu thô / bán thành phẩm nội bộ bếp — **không** hiển thị trên catalog đặt hàng franchise. |
| `finished_good` | Thành phẩm do bếp sản xuất — **được** đặt qua đơn cửa hàng. |
| `resell_product` | Hàng có sẵn từ NCC/brand khác (Coca, Pepsi…) — **được** đặt qua đơn cửa hàng. |

> **Rule**  
> API catalog đặt hàng (`GET /orders/catalog`) luôn lọc `type IN ('finished_good','resell_product')`. Quản trị dùng `GET /products` với lọc `type` tùy chọn.

### 1.15 `vehicle_status`

| Value | Business meaning |
|-------|------------------|
| `available` | Có thể gán cho manifest / shipment. |
| `in_transit` | Đang chạy chuyến. |
| `maintenance` | Bảo trì; không gán chuyến. |

### 1.16 `transfer_order_status`

| Value | Business meaning |
|-------|------------------|
| `draft` | Khởi tạo; chưa thực hiện điều chuyển. |
| `pending` | Chờ duyệt / xử lý (theo quy trình ứng dụng). |
| `in_transit` | Hàng đang trên đường giữa hai cửa hàng. |
| `completed` | Điều chuyển hoàn tất, tồn đã cập nhật. |
| `cancelled` | Hủy lệnh điều chuyển. |

---

## 2. Core Entities (Tables)

Focus: **batches**, **orders**, **shipments**, **inventory_transactions**, **claims**, **production_orders**. Related child tables (**order_items**, **shipment_items**, **claim_items**) are included where they carry the business logic.

### 2.0 `products` (SKU master)

| Field | Logic |
|-------|--------|
| `type` | `product_type` enum; default `raw_material`. Quyết định hiển thị trên catalog franchise và hợp lệ khi tạo `order_items`. |

### 2.1 `batches`

Batches are the **atomic traceability unit** for a product: one manufactured lot with fixed manufacture/expiry dates.

| Field | Logic |
|-------|--------|
| `batch_code` | Human-readable unique identifier for scanning and audits. |
| `product_id` | Links batch to catalog SKU. |
| `manufactured_date` | Traceability anchor (supplier or internal production date). |
| `expiry_date` | **FEFO** ordering key and eligibility for picking (with `products.min_shelf_life` buffer). Indexed (`idx_batches_expiry`) to support efficient “next batch to pick” queries. |
| `status` | Lifecycle gate: e.g. `expired` / `damaged` must block allocation. |
| `physical_quantity` | Total on-hand **on the batch aggregate** (synced from Σ `inventory.quantity` for that batch)—**physical = available + reserved** at batch level. |
| `available_quantity` | Quantity not reserved; can be allocated to new orders/production. |
| `reserved_quantity` | Quantity already committed (orders, production, etc.). |
| `unit_cost_at_import` | **Snapshot** đơn giá vốn tại nhập / sản xuất; dùng cho báo cáo và `total_value_snapshot` trên giao dịch tồn. |

> **Note**  
> Authoritative per-location stock is **`inventory`** (`warehouse_id` + `batch_id`). Batch-level quantities are **denormalized aggregates** for reporting and fast checks; they must stay consistent with inventory lines.

> **Warning**  
> `expiry_date` is not only reporting: together with `products.min_shelf_life` it enforces **“do not ship too close to expiry”** (KFC-style safety buffer).

### 2.2 `orders` & `order_items`

Franchise **store demand** with explicit approval and consolidation semantics.

**`orders`**

| Field | Logic |
|-------|--------|
| `store_id` | Destination franchise context. |
| `status` | Drives the macro workflow (see §1.4). |
| `delivery_date` | Requested or promised delivery time; used with consolidation windows. |
| `consolidation_group_id` | Same group ⇒ eligible to **merge into one shipment** (same store, same delivery window while not finalized). |
| `requires_production_confirm` | Flags dependency on production confirmation before auto-progression. |
| `pending_price_confirm` | Price drift vs catalog (e.g. >20%) requires store acknowledgment before auto-approve flows. |

**`order_items`**

| Field | Logic |
|-------|--------|
| `quantity_requested` | What the store asked for. |
| `quantity_approved` | What supply commits to ship; may be **less than requested** (partial approval) without deleting the line—supports **no “stuck debt” order** semantics when stock is insufficient. |
| `unit_snapshot`, `price_snapshot`, `packaging_info_snapshot` | Immutable commercial and UoM context at order time; master product changes do not rewrite history. |
| `unit_price_at_order` | **Snapshot** giá bán cho franchise tại thời điểm đặt (bổ sung cho báo cáo tài chính; có thể đồng bộ với `price_snapshot` theo policy). |

### 2.2a `routes` & `vehicles` (logistics)

**`routes`** — tuyến giao hàng (khoảng cách, thời gian, chi phí cơ sở).

| Field | Logic |
|-------|--------|
| `route_name` | Tên hiển thị / mã tuyến. |
| `distance_km` | Khoảng cách tham chiếu (decimal). |
| `estimated_hours` | Thời gian chạy ước tính (decimal). |
| `base_transport_cost` | Chi phí vận chuyển cơ sở theo tuyến (decimal). |

**`vehicles`** — xe tải phục vụ manifest.

| Field | Logic |
|-------|--------|
| `license_plate` | Biển số; **unique**. |
| `payload_capacity` | Tải trọng (kg, decimal). |
| `fuel_rate_per_km` | Hệ số nhiên liệu / km (decimal). |
| `status` | `vehicle_status` (available / in_transit / maintenance). |

**`stores.route_id`** — Optional FK tới `routes`: cửa hàng thuộc tuyến nào để gom đơn và lập lịch.

### 2.3 `shipments`, `shipment_items`, `shipment_orders`

Physical **movement** from `from_warehouse_id` to `to_warehouse_id`, optionally under a **manifest** (truck/route).

**`shipments`**

| Field | Logic |
|-------|--------|
| `order_id` | Primary order link (legacy/single-order path). |
| `manifest_id` | Groups many shipments into one vehicle trip (wave / route). |
| `vehicle_id` | FK `vehicles` — xe thực hiện chuyến (manifest). |
| `route_id` | FK `routes` — tuyến gán cho chuyến. |
| `status` | Operational leg (§1.5). |
| `consolidation_group_id` | Aligns with order consolidation. |
| `actual_transport_cost` | Chi phí vận chuyển thực tế chuyến (decimal) — đối soát lãi/lỗ. |
| `total_weight` | Tổng khối lượng chuyến (decimal); kiểm soát tải trọng (song song `total_weight_kg` nếu cần đơn vị cụ thể). |
| `total_weight_kg`, `total_volume_m3`, `overload_warning` | Capacity checks for transport planning. |
| `shipping_address_snapshot`, `contact_phone_snapshot` | Snapshot thông tin giao tại thời điểm tạo shipment batch/consolidation; tránh lệch dữ liệu khi hồ sơ store thay đổi sau đó. |
| `delivered_at` | Proof of arrival timestamp. |

> **Manifest**  
> Luồng gom đơn: `manifests` + `shipment_orders` + `orders`; `shipments` vẫn là thực thể chuyến/chặng gắn `manifest_id`, `vehicle_id`, `route_id`.

**`shipment_items`**

| Field | Logic |
|-------|--------|
| `batch_id` | Batch tied to the line (system of record for what left the hub). |
| `suggested_batch_id` | **FEFO/system-proposed** batch; picker should scan this unless exception (damage) is recorded. |
| `actual_batch_id` | **Scan-confirmed** batch after pick; enables discrepancy detection vs suggestion. |
| `quantity` | Shipped quantity for that batch line. |
| `unit_price_at_shipment` | **Snapshot** đơn giá tại xuất kho / giao (báo cáo tài chính). |

**`shipment_orders`**

| Field | Logic |
|-------|--------|
| `(shipment_id, order_id)` | Many-to-many: **one shipment can consolidate multiple orders**. |

### 2.3a `transfer_orders`

Điều chuyển tồn **giữa hai cửa hàng** (workflow do tầng service triển khai).

| Field | Logic |
|-------|--------|
| `from_store_id`, `to_store_id` | Cửa hàng nguồn / đích. |
| `created_by` | Người tạo lệnh. |
| `status` | `transfer_order_status` (§1.16). |
| `created_at` | Thời điểm tạo. |

### 2.4 `inventory_transactions`

Append-only style **ledger** of quantity changes per `warehouse_id` + `batch_id`.

| Field | Logic |
|-------|--------|
| `type` | See §1.6; encodes economic meaning of the movement. |
| `quantity_change` | Signed delta applied to inventory (convention defined in application services). |
| `waste_reason` | Khi `type = waste` (hoặc báo cáo tiêu hủy): `waste_reason` enum (§1.6a). |
| `total_value_snapshot` | **quantity × giá vốn** tại thời điểm ghi (decimal); hỗ trợ báo cáo lỗ tiêu hủy / điều chỉnh. |
| `reference_id` | Correlation to orders, shipments, receipts, production IDs, etc. |
| `reason`, `evidence_image` | Audit for adjustments, waste, and claims-related corrections. |
| `created_by` | Accountability. |

> **Note**  
> Reservations appear as explicit transaction types (`reservation` / `release`) so **available vs reserved** remains explainable in audits.

### 2.5 `claims` & `claim_items`

Post-delivery **discrepancy** workflow tied to a **shipment**, not abstractly to an order.

**`claims`**

| Field | Logic |
|-------|--------|
| `shipment_id` | Anchors the claim to what was physically sent. |
| `status` | Workflow gate (§1.7). |
| `resolved_at` | Closure timestamp for reporting and SLA. |

**`claim_items`**

| Field | Logic |
|-------|--------|
| `product_id` | Product in dispute (may aggregate multiple batches in business narrative). |
| `quantity_missing` | Short vs `shipment_items` / expected. |
| `quantity_damaged` | Quality loss in transit or at handover. |
| `reason`, `image_url` | Evidence for approval/rejection. |

### 2.6 `recipes` & `recipe_items` (BOM)

| Table / field | Logic |
|---------------|--------|
| `recipes.output_product_id` | Thành phẩm (`products.type` = `finished_good` trong luồng API hiện tại). |
| `recipes.name` | Mirror tên sản phẩm đầu ra khi tạo BOM (không nhập tay qua API). |
| `recipes.is_active` | Chỉ một recipe active cho cùng thành phẩm được khuyến nghị — API tạo lệnh từ chối nếu có **nhiều hơn một** active. |
| `recipe_items.ingredient_product_id` | Nguyên liệu — API chỉ chấp nhận `raw_material`. |
| `recipe_items.quantity_per_output` | Số lượng nguyên liệu cho **1 đơn vị** thành phẩm (nhân với `planned_quantity` trên lệnh để có nhu cầu tổng). |

> **Lưu ý**  
> Cột `standard_output` đã **gỡ** khỏi `recipes` (migration `0028_recipe_drop_standard_output`).

### 2.7 `production_orders`

Internal **manufacturing run** at a central warehouse from a **recipe (BOM)**.

| Field | Logic |
|-------|--------|
| `code` | Unique human reference for kitchen and audits. |
| `recipe_id` | BOM: định mức NL trên **1 đơn vị** thành phẩm (`recipe_items.quantity_per_output`). |
| `warehouse_id` | Where production occurs (typically central). |
| `planned_quantity` | Số lượng thành phẩm dự kiến (cùng đơn vị với sản phẩm đầu ra). |
| `actual_quantity` | As-produced quantity; may differ—drives true batch output. |
| `status` | Lifecycle (§1.12). |
| `kitchen_staff_id` | Executor attribution. |
| `started_at`, `completed_at` | Throughput and lead-time metrics. |

**Related (traceability)**

- `batch_lineage`: parent ingredient batch → child output batch, with `consumed_quantity` and `production_order_id`.
- `production_reservations`: ingredient batches reserved for a specific production order.

---

## 3. Business Rules Mapping

How the schema fields **enforce** the four design principles.

### 3.1 Batch-centric supply

| Mechanism | Fields / tables |
|-----------|------------------|
| Every stock movement is batch-scoped | `inventory.warehouse_id` + `inventory.batch_id` (unique together); `inventory_transactions.batch_id`. |
| Outbound specificity | `shipment_items.batch_id`, `suggested_batch_id`, `actual_batch_id`. |
| Production traceability | `batch_lineage.parent_batch_id`, `child_batch_id`, `production_order_id`, `consumed_quantity`. |
| Batch aggregate mirrors detail | `batches.physical_quantity`, `available_quantity`, `reserved_quantity` vs Σ `inventory`. |

> **Note**  
> Product-level reporting rolls up from **batches**, not the other way around. That matches regulatory and recall scenarios in food chains.

### 3.2 FEFO (First Expiry, First Out)

| Mechanism | Fields / tables |
|-----------|------------------|
| Expiry ordering | `batches.expiry_date` (+ index `idx_batches_expiry`). |
| Shelf-life buffer at sale/ship | `products.min_shelf_life`, `products.shelf_life_days`; receipt lines `stated_expiry_date` / `manufactured_date` when splitting lots. |
| System-directed pick | `shipment_items.suggested_batch_id` (“pick this expiry first”). |
| Scan validation | `shipment_items.actual_batch_id` compared to suggestion to detect wrong-batch picks. |

> **Warning**  
> FEFO is only as good as **accurate `expiry_date` on `batches`** and disciplined scanning. `batch_status` (`expired`, `damaged`) must hard-block allocation in services.

### 3.3 Partial fulfillment (“no stuck order debt”)

| Mechanism | Fields / tables |
|-----------|------------------|
| Request vs commit | `order_items.quantity_requested` vs `order_items.quantity_approved`. |
| Macro state when supply depends on manufacturing | `orders.status = waiting_for_production` (§1.4). |
| Production alignment | `production_orders.planned_quantity` vs `actual_quantity`; output feeds new `batches` that unblock fulfillment. |
| Reservations | `transaction_type` `reservation` / `release` and batch `reserved_quantity` prevent over-promising **approved** quantities. |

Partial approval allows the workflow to **record truth** (we can only ship X now) while keeping the order structurally valid and traceable—instead of leaving ambiguous full-line quantities that never ship.

### 3.4 Discrepancy handling (shipment vs claim)

| Mechanism | Fields / tables |
|-----------|------------------|
| What was sent | `shipment_items` (batch + `quantity`; optional `actual_batch_id` vs `suggested_batch_id`). |
| What was disputed | `claims.shipment_id` + `claim_items` (`quantity_missing`, `quantity_damaged`, evidence). |
| Order-level signal | `orders.status = claimed` when business rules attach post-claim state to the order. |

```text
shipment_items  ──►  physical truth at dispatch (per batch)
       │
       ▼
   shipments  ◄──  claims (header)
       │
       ▼
   claim_items  ──►  missing/damaged per product (evidence)
```

> **Note**  
> Claims are **shipment-scoped** so consolidated routes ( `shipment_orders` ) still have a single physical event to reconcile; line-level detail lives in `claim_items` by `product_id`.

---

## 4. Quick reference: enum → PostgreSQL type names

| PostgreSQL enum type | TypeScript / Drizzle export |
|----------------------|-----------------------------|
| `role` | `roleEnum` |
| `user_status` | `userStatusEnum` |
| `warehouse_type` | `warehouseTypeEnum` |
| `order_status` | `orderStatusEnum` |
| `shipment_status` | `shipmentStatusEnum` |
| `transaction_type` | `transactionTypeEnum` |
| `waste_reason` | `wasteReasonEnum` |
| `vehicle_status` | `vehicleStatusEnum` |
| `transfer_order_status` | `transferOrderStatusEnum` |
| `claim_status` | `claimStatusEnum` |
| `receipt_status` | `receiptStatusEnum` |
| `batch_status` | `batchStatusEnum` |
| `manifest_status` | `manifestStatusEnum` |
| `picking_list_status` | `pickingListStatusEnum` |
| `production_order_status` | `productionOrderStatusEnum` |
| `inventory_adjustment_ticket_status` | `inventoryAdjustmentTicketStatusEnum` |

---

*End of document.*
