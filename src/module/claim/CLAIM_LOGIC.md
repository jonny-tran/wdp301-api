# CLAIM Module — Discrepancy Handling (SP26SWP07)

**Principle:** Claims tie **post-delivery discrepancies** to a **specific shipment** and, for manual claims, to **batch-level** quantities at the store. Traceability is mandatory.

---

## 1. Business flow (when a claim exists)

### 1.1 Automatic claim on receive (shipment module)

When franchise staff completes **`POST /shipments/:id/receive`** (or receive-all):

- For each `shipment_item`, the service compares **shipped quantity** vs **reported `actualQty` / `damagedQty`**.
- If there is **missing** or **damaged** quantity, the shipment flow creates a **claim** inside the same DB transaction (via `ClaimService.createClaim`), attaches line items (`productId`, `quantityMissing`, `quantityDamaged`, reason, optional evidence URL), sets shipment to **completed**, and may set the related **order** to **`claimed`**.

### 1.2 Manual claim (store-initiated)

**`POST /claims`** (implemented route name; not `/claims/manual`):

- **Who:** `franchise_store_staff` or `admin`.
- **When:** After the shipment is **`completed`**, within **24 hours** of shipment completion (`updatedAt`), and the shipment’s order belongs to the staff’s `storeId`.
- **Effect:** Creates `claims` + `claim_items`, **decreases store inventory** immediately for claimed quantities, writes **`inventory_transactions`** (`type: adjustment`), sets order status to **`claimed`**.

> **Warning**  
> Manual claim requires **sufficient on-hand stock** at the store warehouse for each `batchId` claimed (business rule in `ClaimService.createManualClaim`).

---

## 2. Claim status enum

Stored values are **lowercase** strings (PostgreSQL enum + TS enum).

| Constant | DB value | Meaning |
|----------|----------|---------|
| `PENDING` | `pending` | Awaiting coordinator/manager decision. |
| `APPROVED` | `approved` | Resolution accepted (see §3 — current backend scope). |
| `REJECTED` | `rejected` | Dispute denied; `resolvedAt` set. |

> **Note on naming**  
> The codebase uses **`approved`**, not `resolved`. Treat **`approved`** as the terminal “accepted” state for analytics and UI labels (you may display it as “Resolved” in the UI if desired).

---

## 3. Resolution rules (policy vs current code)

### 3.1 Implemented today

**`PATCH /claims/:id/resolve`** with body `ResolveClaimDto`:

- `status`: **`approved` | `rejected`** only (`pending` is invalid here).
- Optional `resolutionNote` exists on the DTO but is **not persisted** by `ClaimRepository.updateClaimStatus` in the current implementation — only `status` and `resolvedAt` are updated.

### 3.2 Intended business policies (for product roadmap)

| Decision | Expected behavior (not fully automated in claim service) |
|----------|------------------------------------------------------------|
| **Refund / credit** | Post financial adjustment or AR note against the store/accounting module. |
| **Re-ship** | Create a new outbound fulfillment (order line or shipment) and allocate stock using **FEFO** (batch selection in order/shipment services). |

Implementing **REFUND** vs **RE-SHIP** should extend `ResolveClaimDto` and transactional workflows; until then, **`approved`/`rejected`** are workflow flags only.

---

## 4. API specification

Base path: `@Controller('claims')`. All routes use **`AtGuard` + `RolesGuard`** unless noted.

### 4.1 `POST /claims` — manual claim

| Item | Detail |
|------|--------|
| **Roles** | `franchise_store_staff`, `admin` |
| **Body (`CreateManualClaimDto`)** | `shipmentId` (UUID), optional `description`, `items[]`: `batchId`, `quantityMissing`, `quantityDamaged`, optional `reason`, optional `imageProofUrl` |
| **Evidence rule** | If `quantityDamaged > 0`, **`imageProofUrl` and `reason` are required** per batch line. |
| **Response** | Created claim record (from transactional create). |

### 4.2 `GET /claims` — list (coordinator/manager)

| Item | Detail |
|------|--------|
| **Roles** | `manager`, `supply_coordinator`, `admin` |
| **Query (`GetClaimsDto`)** | Pagination (`page`, `limit`, `sortBy`, `sortOrder`), optional `status`, `search`, `storeId`, `fromDate`, `toDate` |
| **Response** | Paginated list (`items` + `meta`). |

### 4.3 `GET /claims/my-store` — list for store staff

| Item | Detail |
|------|--------|
| **Roles** | `franchise_store_staff` |
| **Behavior** | Forces `storeId` = JWT `storeId` (must be present). Same query DTO as above for filters. |

### 4.4 `GET /claims/:id` — detail

| Item | Detail |
|------|--------|
| **Roles** | `franchise_store_staff`, `supply_coordinator`, `manager`, `admin` |
| **Isolation** | Store staff denied if claim’s shipment order store ≠ their `storeId`. |
| **Response** | `id`, `shipmentId`, `status`, `createdAt`, `resolvedAt`, `items[]` with product name/SKU, quantities, reason, `imageUrl`. |

### 4.5 `PATCH /claims/:id/resolve` — resolve

| Item | Detail |
|------|--------|
| **Roles** | `supply_coordinator`, `manager`, `admin` |
| **Body (`ResolveClaimDto`)** | `status`: `approved` \| `rejected`, optional `resolutionNote` (note: persistence TBD). |
| **Response** | Updated claim row. |

### 4.6 `GET /claims/analytics/summary` — manager analytics

| Item | Detail |
|------|--------|
| **Roles** | `manager`, `admin` |
| **Query** | Optional `productId` (`ClaimSummaryQueryDto`). |

> **Note**  
> Path has two segments (`analytics/summary`), so it does not collide with `GET /claims/:id`. Avoid adding a bare `GET /claims/analytics` without defining it explicitly, or `:id` could match the literal `analytics`.

---

## 5. Evidence fields

| Field | Location |
|-------|----------|
| `imageProofUrl` | Request DTO on **manual** claim items → stored as `claim_items.image_url`. |
| `evidenceUrls` | **Receive shipment** DTO: joined into claim line `imageUrl` when auto-creating claim. |

Damaged goods **must** carry proof when the business rule applies (manual path enforced in service).

---

## 6. Notes for Cursor (traceability)

1. **Always link `shipment_id`** on `claims` — every claim row is shipment-scoped.
2. **Manual claims** are validated per **`batchId`** at the store warehouse; repository resolves `productId` from `batches` for `claim_items`.
3. **Auto claims** from receive use **`productId`** from `shipment_items → batches` but the discrepancy is still derived per **batch line** on the shipment.
4. When extending resolution (**re-ship**), new shipment lines must again reference concrete **`batch_id`** values chosen under **FEFO** rules in the shipment/order layer.

---

## 7. File map

| File | Role |
|------|------|
| `claim.controller.ts` | HTTP API |
| `claim.service.ts` | Manual claim transaction, resolution, analytics |
| `claim.repository.ts` | Persistence, filters by store via shipment ids |
| `dto/create-manual-claim.dto.ts` | Manual claim payload |
| `dto/resolve-claim.dto.ts` | Resolve payload |
| `constants/claim-status.enum.ts` | `pending` / `approved` / `rejected` |
