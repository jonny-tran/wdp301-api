## Relations
@structure/data_models/schema.md

## Raw Concept
**Task:**
Define Batch-Centric Inventory Core Logic

**Changes:**
- Enforced batch-centric queries in `InventoryRepository`

**Files:**
- src/database/schema.ts
- src/module/inventory/inventory.repository.ts

**Flow:**
Inventory Item = Warehouse ID + Product ID + Batch ID

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/database/schema.ts`: Defines `inventory`, `batches`, `warehouses` tables\n- `src/module/inventory/inventory.repository.ts`: Handles low-level inventory operations (upsert, transactions)

### Dependencies
- PostgreSQL with Drizzle ORM\n- `inventory` table references `batches` and `warehouses`\n- `batches` table contains `expiry_date` and references `products`

### Features
- Every inventory item is defined by `Warehouse ID + Product ID + Batch ID`\n- Total quantity for a product is never stored directly; it must be derived from batches\n- AI must always query the `batches` table via `inventory` to check availability
