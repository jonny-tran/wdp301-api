## Raw Concept
**Task:**
Refactor ShipmentService to delegate complex logic to ShipmentHelper for better maintainability and testability.

**Changes:**
- Extracted validation logic from `ShipmentService.receiveShipment` to `ShipmentHelper.validateShipmentAccess` and `ShipmentHelper.validateBatchConsistency`.
- Moved item processing and discrepancy calculation to `ShipmentHelper.processReceivedItems`.
- Refactored `ShipmentService.receiveShipment` to use the new helper methods within a database transaction.

**Files:**
- src/module/shipment/shipment.service.ts
- src/module/shipment/helper/shipment.helper.ts

**Flow:**
receiveShipment -> validateShipmentAccess -> validateBatchConsistency -> processReceivedItems -> updateInventory -> updateShipmentStatus -> [createClaim]

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/module/shipment/shipment.service.ts`: Orchestrates the reception flow using transaction management.
- `src/module/shipment/helper/shipment.helper.ts`: Encapsulates validation and calculation logic to keep the service lean.

### Dependencies
- ShipmentService: High-level service for shipment operations
- ShipmentHelper: Static helper class for domain logic and validation
- ShipmentRepository: Data access layer for shipments
- InventoryService: Handles physical stock updates
- ClaimService: Handles discrepancy reporting

### Features
### Shipment Reception Flow
1. **Access Validation**: Verifies shipment exists, belongs to the store's warehouse, and is in `in_transit` status.
2. **Consistency Check**: Ensures all reported batches are actually part of the shipment.
3. **Quantity Processing**: 
   - Calculates `goodQty` (Actual - Damaged).
   - Identifies discrepancies (Missing or Damaged items).
4. **Inventory Update**: Increments warehouse stock for good items and logs transactions.
5. **Status Update**: Marks shipment as `completed`.
6. **Claim Creation**: Automatically triggers a claim if discrepancies are found.
