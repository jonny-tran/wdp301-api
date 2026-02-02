## Relations
@structure/inventory/batch_centric_inventory.md

## Raw Concept
**Task:**
Implement FEFO (First Expired, First Out) Logic

**Changes:**
- Implemented FEFO sorting in `OrderService.approveOrder`

**Files:**
- src/module/order/order.service.ts
- src/module/order/order.repository.ts

**Flow:**
Order Approval -> Fetch Batches (sorted by Expiry ASC) -> Reserve Inventory -> Create Shipment

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/module/order/order.service.ts`: Implements FEFO logic in `approveOrder` and `reviewOrder` methods\n- `src/module/order/order.repository.ts`: Provides `getBatchesForFEFO` method

### Dependencies
- `batches.expiry_date` column\n- `inventory` table joining with `batches`

### Features
- Stock export must prioritize batches with the earliest expiry date\n- Query algorithm: `SELECT * FROM batches JOIN inventory ... ORDER BY expiry_date ASC`\n- Expired batches (`expiry_date <= CURRENT_DATE`) must be excluded from fulfillment
