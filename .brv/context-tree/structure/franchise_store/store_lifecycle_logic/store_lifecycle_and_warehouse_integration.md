## Raw Concept
**Task:**
Define Franchise Store creation and deletion logic

**Changes:**
- Implemented automatic warehouse creation upon store registration
- Standardized soft delete using isActive flag for franchise stores

**Files:**
- src/module/franchise-store/franchise-store.service.ts
- src/database/schema.ts

**Flow:**
Create Store -> Transaction Start -> Insert Store -> Insert Warehouse (type: store_internal) -> Transaction Commit

**Timestamp:** 2026-02-05

## Narrative
### Structure
- Logic typically resides in `FranchiseStoreService`
- Database table: `franchise_stores` and `warehouses`

### Dependencies
- Hard dependency on Warehouse module during store creation
- Soft delete pattern via `isActive` flag

### Features
- Automatic Warehouse Creation: Creating a `FranchiseStore` automatically creates a corresponding `Warehouse` with `type: 'store_internal'`.
- Soft Delete: Stores use an `isActive` boolean flag for deletion instead of physical row removal.
