## Relations
@structure/inventory/fefo_logic.md

## Raw Concept
**Task:**
Implement No Backorders / Partial Fulfillment Rule

**Changes:**
- Logic in `OrderService.approveOrder` to handle stock shortages without backorders

**Files:**
- src/module/order/order.service.ts

**Flow:**
Check Stock -> Calculate Max Approvable -> Update Order Item -> Create Shipment for Partial Qty

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/module/order/order.service.ts`: `approveOrder` method enforces partial fulfillment by capping `approvedQty` at available stock.

### Dependencies
- `order_items.quantity_approved` column\n- `shipment_items` table

### Features
- No "owed" or "backordered" items allowed\n- If requested quantity > available quantity, approve available and cancel the rest (Partial Fulfillment)\n- `OrderItem.approved_qty` must always be `<=` `OrderItem.requested_qty`
