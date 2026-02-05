## Relations
@structure/inventory/batch_centric_inventory/batch_centric_inventory_principle.md
@structure/inventory/fefo_logic/fefo_export_strategy.md
@structure/inventory/inventory_tracking/inventory_tracking_and_history.md

## Raw Concept
**Task:**
Implement Manager Inventory Endpoints and Transactional Logic

**Changes:**
- Added `minStockLevel` column to `products` table
- Implemented `adjustInventory` with `FOR UPDATE` row-level locking in transactions
- Added `inventory_transactions` logging for all manual adjustments
- Implemented `getLowStockItems` endpoint using `minStockLevel` threshold
- Implemented `getInventorySummary` with FEFO-based filtering (excluding expired batches)

**Files:**
- src/module/inventory/inventory.service.ts
- src/module/inventory/inventory.controller.ts
- src/database/schema.ts
- src/module/inventory/inventory.repository.ts

**Flow:**
Manager -> adjustInventory -> Transaction Start -> SELECT FOR UPDATE -> Update Stock -> Log Transaction -> Transaction Commit

**Timestamp:** 2026-02-05

## Narrative
### Structure
- `src/module/inventory/inventory.service.ts`: Implements `adjustInventory`, `getLowStockItems`, and `getInventorySummary`.
- `src/module/inventory/inventory.controller.ts`: Manager-level endpoints for inventory oversight.
- `src/database/schema.ts`: Added `minStockLevel` to the `products` table.

### Dependencies
- Dependency: `inventory.repository.ts` for atomic upserts and locking
- Dependency: `inventory_transactions` table for audit logging

### Features
- **Transactional Inventory Adjustment**: Uses `FOR UPDATE` locking to prevent race conditions during stock updates.
- **Low Stock Alerts**: Products now have a `minStockLevel` property to trigger low-stock alerts.
- **Inventory Summary**: Provides a warehouse-wide view of stock, filtered by FEFO (First-Expired, First-Out) principles.
- **Audit Trail**: Every adjustment is recorded in `inventory_transactions`.
