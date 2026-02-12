## Relations
@structure/inventory/batch_centric_inventory.md
@structure/warehouse/bulk_fulfillment/bulk_fulfillment_and_atomic_export.md

## Raw Concept
**Task:**
Implement and Enforce FEFO (First Expired, First Out) Logic

**Changes:**
- Implemented FEFO sorting in `OrderService.approveOrder`
- Added delivery date validation in `WarehouseService.finalizeBulkShipment`

**Files:**
- src/module/order/order.service.ts
- src/module/order/order.repository.ts
- src/module/warehouse/warehouse.service.ts

**Flow:**
Order Approval -> Fetch Batches (sorted by Expiry ASC) -> Reserve Inventory -> Fulfillment Validation (Expiry > Delivery Date) -> Export Stock

**Timestamp:** 2026-02-12

## Narrative
### Structure
- `src/module/order/order.service.ts`: Implements FEFO logic in `approveOrder` and `reviewOrder` methods\n- `src/module/order/order.repository.ts`: Provides `getBatchesForFEFO` method\n- `src/module/warehouse/warehouse.service.ts`: Enforces FEFO validation rules during bulk fulfillment.

### Dependencies
- `batches.expiry_date` column\n- `inventory` table joining with `batches`\n- `orders.deliveryDate` for runtime validation during fulfillment

### Features
- Stock export must prioritize batches with the earliest expiry date\n- Query algorithm: `SELECT * FROM batches JOIN inventory ... ORDER BY expiry_date ASC`\n- Expired batches (`expiry_date <= CURRENT_DATE`) must be excluded from fulfillment\n- **Strict Fulfillment Rule**: Batches expiring on or before the delivery date are blocked during the fulfillment phase (`WarehouseService.finalizeBulkShipment`).
