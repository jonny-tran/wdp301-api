# Project Specification: Central Kitchen & Franchise Management System (KFC Model)

**Project Code:** SP26SWP07

**System Type:** SCM (Supply Chain Management) for F&B

**Principles:** Batch-Centric, FEFO, No Backorders, Real-time Discrepancy.

---

## 1. Core Business Rules (Immutable)

These rules are the "North Star" for all logic implementation. Do not deviate.

- **Batch-Centric Inventory:** Inventory is NOT a simple column in the `Product` table. It is the sum of `Batch.quantity` across different `Warehouses`. Every stock movement must reference a specific `Batch ID`.
- **FEFO (First Expired, First Out):** Any automated suggestion for picking/shipping MUST prioritize batches with the earliest expiry date.
- **No Backorders:** If a warehouse has only 30 units but the store ordered 50:

1. Ship 30 (Partial Fulfillment).
2. Cancel the remaining 20.
3. The system must NEVER create a "pending debt" (backorder) for the next day.

- **Discrepancy Handling:** When a store receives goods, the actual quantity received updates the inventory immediately. Differences (damaged/missing) are recorded as `Claim Tickets` for later resolution, but the stock level must reflect reality instantly.

## 2. Technical Stack

- **Backend:** Node.js / NestJS
- **Database:** PostgreSQL (using Drizzle ORM)
- **Logic Pattern:** Strict Repository-Service-Controller. All inventory changes MUST be wrapped in Database Transactions.

## 3. Manager Inventory Module (Target Implementation)

This module provides the "God View" for the manager to oversee the chain.

### A. Inventory Summary (`GET /inventory/summary`)

- **Logic:** Aggregate `Batch` quantities grouped by `Warehouse` and `Product`.
- **Filter Requirements:** `warehouse_id`, `category_id`, `search_term`.
- **Strict Rule:** Only include batches with `expiry_date > NOW()`.

### B. Low Stock Warning (`GET /inventory/low-stock`)

- **Logic:** Compare `SUM(Batch.quantity)` against `Product.min_stock_level`.
- **Priority:** Alert if the Central Kitchen (CK) warehouse is low, as it risks the entire franchise chain.

### C. Manual Stock Adjustment (`POST /inventory/adjust`)

- **Constraint:** This is the only way to manually override stock. It is "Append-only".
- **Operation:** 1. Update `Batch.quantity`.

2.  Insert a record into `InventoryTransaction` with type `ADJUSTMENT`.
3.  Must include `reason` (e.g., DAMAGED, LOST, STOCKTAKE).
4.  **Transaction Safety:** Use `SELECT ... FOR UPDATE` to lock the batch row during adjustment.

## 4. Entity Relationship Context

- **Product:** The master definition (Name, Unit, Min Stock).
- **Batch:** The physical instance of a product (Expiry Date, Manufacturing Date, Batch Code).
- **Warehouse:** Locations (Central Kitchen vs. Franchise Stores).
- **InventoryTransaction:** The immutable ledger of every single unit moved (Import, Export, Adjust, Waste).

---

## 5. Instructions for Implementation

When assisting with code:

1. **Check for Transactions:** Ensure any write operation involving Stock uses a DB Transaction.
2. **Validate Quantity:** Prevent any adjustment that results in a negative quantity.
3. **Strict Typing:** Use DTOs for all request payloads.
4. **Logging:** Every movement must have a corresponding `InventoryTransaction` entry.
