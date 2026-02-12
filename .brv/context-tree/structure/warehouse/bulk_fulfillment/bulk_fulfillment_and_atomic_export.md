## Relations
@structure/inventory/fefo_logic/fefo_export_strategy.md
@structure/inventory/batch_centric_inventory.md

## Raw Concept
**Task:**
Refactor Bulk Fulfillment to support consolidating multiple orders in a single transaction.

**Changes:**
- Refactored `finalizeBulkShipment` to accept and process multiple orders in one transaction
- Updated DTO structure to support an array of orders with their respective picked items
- Maintained atomic transaction integrity across multiple order processing cycles

**Files:**
- src/module/warehouse/warehouse.service.ts
- src/module/warehouse/dto/finalize-bulk-shipment.dto.ts

**Flow:**
Request (Array of Orders) -> Transaction Start -> [Loop: Fetch Order -> Validate Expiry -> Decrease Stock -> Audit Log -> Update Shipment -> Update Order] -> Transaction Commit

**Timestamp:** 2026-02-12

## Narrative
### Structure
- `src/module/warehouse/warehouse.service.ts`: The `finalizeBulkShipment` method has been refactored to iterate over an array of orders, wrapping the entire loop in a single Drizzle transaction for cross-order atomicity.

### Dependencies
- Relies on `batches` table for expiry dates.
- Uses `orders.deliveryDate` to validate batch eligibility.
- Integrated with `inventoryTransactions` for audit logging.
- Hard dependency on `WarehouseRepository.decreaseStockFinal` for atomic stock reduction.

### Features
- **Consolidated Multi-Order Fulfillment**: Supports processing multiple orders within a single atomic database transaction.
- **Atomic Transaction**: Ensures all inventory changes, status updates, and audit logs for ALL included orders succeed or fail together.
- **Inventory Export**: Decreases stock levels across multiple batches and orders, recording `export` type transactions for each.
- **Status Transition**: Automatically moves multiple Orders to `DELIVERING` and their related Shipments to `IN_TRANSIT`.
- **FEFO Validation**: Enforces a strict rule per order that batches expiring on or before the individual order's delivery date cannot be used.
