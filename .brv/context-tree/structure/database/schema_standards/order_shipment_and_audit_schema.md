## Relations
@structure/inventory/batch_centric_inventory.md
@code_style/database/naming_convention.md

## Raw Concept
**Task:**
Define Database Schema Standards for Traceability

**Changes:**
- Validated schema integrity for order/shipment separation and batch-level shipment tracking.

**Files:**
- src/database/schema.ts

**Flow:**
Order (Product level) -> Approval -> Shipment (Batch level) -> Inventory Transaction (Audit)

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/database/schema.ts`: Defines the schema for `orders`, `order_items`, `shipments`, `shipment_items`, and `inventory_transactions`.

### Dependencies
- `orders` and `order_items` tables\n- `shipments` and `shipment_items` tables\n- `inventory_transactions` table

### Features
- **Orders vs Shipments**: Orders track customer intent (requested vs approved qty); Shipments track physical movement.\n- **Batch Tracking**: `shipment_items` must link to a specific `batch_id` to support FEFO and traceability.\n- **Audit Log**: Every change in stock levels (import, export, waste, adjustment) must create an immutable record in `inventory_transactions`.
