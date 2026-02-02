## Relations
@code_style/api/response_standard/api_response_and_localization.md

## Raw Concept
**Task:**
Add OpenAPI/Swagger documentation for Claim and Inventory DTOs

**Changes:**
- Added @ApiProperty decorators to Claim DTOs
- Added @ApiProperty decorators to Inventory DTOs
- Enhanced Swagger documentation for manual claim creation and resolution flows

**Files:**
- src/module/claim/dto/create-manual-claim.dto.ts
- src/module/claim/dto/resolve-claim.dto.ts
- src/module/inventory/inventory.dto.ts

**Flow:**
Request -> DTO Validation (class-validator) -> Swagger Documentation (ApiProperty) -> Controller

**Timestamp:** 2026-02-01

## Narrative
### Structure
src/module/claim/dto/
  - create-manual-claim.dto.ts: @ApiProperty for shipmentId, items.
  - resolve-claim.dto.ts: @ApiProperty for status (enum), reason.
src/module/inventory/
  - inventory.dto.ts: @ApiProperty for inventoryId, batchId, quantity, etc.

### Dependencies
- @nestjs/swagger: For API documentation decorators.
- class-validator: For request body validation.

### Features
- Claim DTOs: Documented CreateManualClaimDto and ResolveClaimDto with field descriptions, minimum values, and optional flags.
- Inventory DTOs: Documented InventoryDto with properties for batch details, product info, and stock levels.
- Swagger UI: All DTOs are now visible and testable via the Swagger documentation interface.
