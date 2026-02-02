## Relations
@structure/order/fulfillment_rules.md

## Raw Concept
**Task:**
Implement Claim APIs (Detail, Manual, Resolve)

**Changes:**
- Added Claim Detail endpoint (GET /claims/:id)
- Added Manual Claim creation (POST /claims) with shipment and batch validation
- Added Resolve Claim endpoint (PATCH /claims/:id/resolve)
- Integrated with Shipment and Order status flow

**Files:**
- src/module/claim/claim.controller.ts
- src/module/claim/claim.service.ts
- src/module/claim/claim.repository.ts

**Flow:**
createManualClaim -> validate shipment -> validate items -> create claim -> create claim items -> update order status to 'claimed'

**Timestamp:** 2026-02-01

## Narrative
### Structure
src/module/claim/
  - claim.controller.ts: API endpoints for claims
  - claim.service.ts: Business logic and validation
  - claim.repository.ts: Drizzle ORM operations
  - dto/: Request validation schemas (CreateManualClaimDto, ResolveClaimDto)

### Dependencies
- ClaimRepository: Database operations for claims
- ShipmentRepository: Validating shipment status and ownership
- UnitOfWork: Transactional integrity for claim creation and order status updates

### Features
- Manual Claim Creation: FRANCHISE_STORE_STAFF can create claims for completed shipments.
- Claim Validation: Ensures shipment belongs to the store, is completed, and items/batches match.
- Image Proof: Required for damaged items.
- Claim Resolution: SUPPLY_COORDINATOR or MANAGER can update claim status (pending -> resolved).
- Order Integration: Updates order status to 'claimed' upon claim creation.
