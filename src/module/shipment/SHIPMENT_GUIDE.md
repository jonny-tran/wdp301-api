# SHIPMENT Module — Fulfillment & Receiving

**Project:** SP26SWP07  
**Flow:** Central (or origin) warehouse **prepares** → **in transit** → store **receives**; discrepancies create **claims** inside a **single database transaction**.

---

## 1. Delivery lifecycle (shipment status)

| Status | Meaning |
|--------|---------|
| `preparing` | Pick/stage/load not finalized. |
| `in_transit` | **Only state allowed for receive** in `ShipmentService.receiveShipment`. |
| `delivered` | Intermediate handoff (if used in your ops pipeline). |
| `completed` | Receive flow finished; inventory updated. |
| `cancelled` | Voided shipment — no receive. |

**Operational narrative**

1. **Central kitchen / coordinator** prepares shipment and moves it to **`in_transit`** (outside or inside this service depending on your workflow).
2. **Store staff** calls receive while status is **`in_transit`**.
3. On success, status becomes **`completed`**; order may become **`completed`** or **`claimed`**.

---

## 2. Receiving — critical logic (`receiveShipment`)

**Endpoints**

- `POST /shipments/:id/receive` — detailed receive (`ReceiveShipmentDto`).
- `PATCH /shipments/:id/receive-all` — convenience: empty `items` ⇒ full quantity as shipped, no damage.

**Rules**

1. **Ownership:** `shipment.order.storeId` must equal JWT `storeId` for franchise staff.
2. **Status:** Must be `in_transit`.
3. **Per shipped line (`shipment_items`):**
   - If DTO contains an entry for `batchId`, use **`actualQty`** and **`damagedQty`**.
   - If no entry, assume **full shipped quantity**, zero damage.
   - `goodQty = actualQty - damagedQty` (validated ≥ 0).
4. **Inventory:** For each line, `goodQty > 0` → `InventoryService.updateInventory` + **`InventoryService.logInventoryTransaction`** with type **`import`**, `referenceId` = shipment id, reason `'Shipment Receipt'`.
5. **Discrepancy:** If `missingQty = shipped - actual > 0` OR `damagedQty > 0`, push a **claim line** (productId, missing, damaged, reason, optional evidence).
6. **Transaction boundary:** `UnitOfWork.runInTransaction` wraps: inventory updates, shipment status → `completed`, optional **`ClaimService.createClaim`**, order status → **`claimed`** or **`completed`**.

> **Note**  
> The prompt mentioned `store_receipt` as transaction type; the **implemented** type string is **`import`** with human-readable reason `'Shipment Receipt'`.

> **Warning**  
> There is **no** `report_issue` boolean column on shipments — discrepancy is implied by **`hasDiscrepancy`** + `claimId` in the JSON response and/or presence of a claim record.

**Response shape (success)**

```json
{
  "message": "Xác nhận nhận hàng thành công.",
  "shipmentId": "...",
  "status": "completed",
  "hasDiscrepancy": true,
  "claimId": "uuid-or-null"
}
```

### 2.1 Receive DTO (`ReceiveShipmentDto`)

| Field | Type | Description |
|-------|------|-------------|
| `items` | `ReceiveItemDto[]` | Optional; omit or empty = receive full. |
| `items[].batchId` | int | Batch on the shipment line. |
| `items[].actualQty` | number | Physically received (≥ 0). |
| `items[].damagedQty` | number | Damaged subset (≥ 0). |
| `items[].evidenceUrls` | string[] | Optional photo URLs for proof. |
| `notes` | string | Optional free text. |

---

## 3. Listing & detail

### 3.1 `GET /shipments`

- **Roles:** `manager`, `supply_coordinator`, `admin`.
- **Query (`GetShipmentsDto`):** `status`, `storeId`, `search`, `fromDate`, `toDate`, pagination.

### 3.2 `GET /shipments/store/my`

- **Roles:** `franchise_store_staff`.
- **Behavior:** Sets `storeId` from JWT — **only this store’s** shipments.

> **Note**  
> `central_kitchen_staff` is **not** on the list route in current `@Roles`; kitchen workflows use picking list endpoints instead.

### 3.3 `GET /shipments/:id`

- **Roles:** All authenticated users in guard stack; **store staff** forbidden if shipment not destined to their warehouse’s store.
- **Response:** Shipment header + **items sorted by `expiryDate` ascending (FEFO display)**.

### 3.4 `GET /shipments/:id/picking-list`

- **Roles:** `supply_coordinator`, `central_kitchen_staff`, `admin`.
- **Purpose:** Warehouse-friendly list: product name, SKU, `batch_code`, quantity, expiry.

---

## 4. Notes for Cursor (AI IDE)

1. **`receiveShipment` must stay transactional** — never split inventory update, shipment status, claim creation, and order status across separate non-atomic calls.
2. **Batch-centric:** Every receive iteration uses `shipmentItem.batchId`; good stock is posted against that batch at `toWarehouseId`.
3. **FEFO:** Picking/shipment building elsewhere assigns batches; receive **records reality** per batch line. Display order for store confirmation uses expiry sort in `getShipmentDetail`.
4. When adding features (e.g. partial receive policies), preserve **claim + inventory + status** consistency in the same `runInTransaction` callback.

---

## 5. Frontend guide

### 5.1 Store staff

- List **`in_transit`** shipments via `GET /shipments/store/my?status=in_transit` (confirm enum string in `ShipmentStatus`).
- Receive UI: for each batch line, allow editing **actual** / **damaged**; if damaged or short, **require** `evidenceUrls` per business UX (API accepts optional array but claims/manual rules elsewhere may require proof).

### 5.2 Kitchen staff

- Use **`GET /shipments/:id/picking-list`** or warehouse module flows to scan **`batch_code`** and confirm pick quantities before dispatch.

---

## 6. File map

| File | Role |
|------|------|
| `shipment.controller.ts` | Routes |
| `shipment.service.ts` | Receive transaction, picking list, detail |
| `shipment.repository.ts` | Queries / updates |
| `dto/receive-shipment.dto.ts` | Receive payload |
| `dto/get-shipments.dto.ts` | List filters |
| `constants/shipment-status.enum.ts` | Status strings |
