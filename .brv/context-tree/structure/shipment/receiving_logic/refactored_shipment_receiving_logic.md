## Raw Concept
**Task:**
Refactor Shipment Receiving Logic: Auto-Claim, Per-Item Evidence, and Happy Path Support

**Changes:**
- Refactored `receiveShipment` to handle optional item reports (happy path full receipt).
- Added support for per-item `evidenceUrls` in shipment receipt.
- Implemented automatic claim creation logic for discrepancies (missing/damaged).
- Updated order status logic to switch between `COMPLETED` and `CLAIMED`.

**Files:**
- src/module/shipment/shipment.service.ts
- src/module/shipment/dto/receive-shipment.dto.ts

**Flow:**
receiveShipment -> validate shipment status -> map reported items -> loop shipped items -> calculate missing/damaged -> update inventory for good items -> create claim if discrepancies -> update shipment to COMPLETED -> update order status.

**Timestamp:** 2026-02-12

## Narrative
### Structure
src/module/shipment/shipment.service.ts (receiveShipment method)

### Dependencies
Depends on `ClaimService` for automatic claim generation and `InventoryService` for stock updates.

### Features
- **Auto-Claim**: Automatically creates a claim if missing or damaged quantities are reported.
- **Per-Item Evidence**: Supports multiple evidence URLs per batch item during receipt.
- **Happy Path Support**: If no items are specified in the request, it assumes full receipt of all shipped items.
- **Inventory Sync**: Updates destination warehouse stocks only for 'good' items (actual - damaged).
- **Order Status Transition**: Transitions order to `COMPLETED` or `CLAIMED` based on discrepancies.
