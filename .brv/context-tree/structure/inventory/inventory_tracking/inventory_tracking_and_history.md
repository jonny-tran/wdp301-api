## Relations
@structure/inventory/batch_centric_inventory.md

## Raw Concept
**Task:**
Implement Inventory APIs (Store Inventory, History)

**Changes:**
- Added Store Inventory endpoint (GET /inventory/store)
- Added Inventory History/Transactions endpoint (GET /inventory/store/transactions)
- Implemented logInventoryTransaction for audit trails
- Implemented updateInventory with upsert logic

**Files:**
- src/module/inventory/inventory.controller.ts
- src/module/inventory/inventory.service.ts
- src/module/inventory/inventory.repository.ts

**Flow:**
getStoreTransactions -> find warehouse by storeId -> fetch transactions from repository -> map to DTO

**Timestamp:** 2026-02-01

## Narrative
### Structure
src/module/inventory/
  - inventory.controller.ts: API endpoints for store inventory and history
  - inventory.service.ts: Logic for fetching stock and logging transactions
  - inventory.repository.ts: Drizzle ORM operations for inventory and transactions

### Dependencies
- InventoryRepository: Database operations for inventory and transactions
- Warehouse: Inventory is scoped by warehouse (linked to stores)

### Features
- Store Inventory View: FRANCHISE_STORE_STAFF can view current stock levels (batch-centric).
- Inventory History (Transactions): View history of imports, exports, waste, and adjustments.
- Transaction Logging: Records every inventory change with type and reference ID.
- Inventory Updates: Atomic upsert operations for stock levels.
