## Relations
@code_style/api/response_standard/api_response_and_localization.md

## Raw Concept
**Task:**
Implement standardized Pagination & Filtering pattern across the codebase, starting with ProductModule.

**Changes:**
- Created `PaginationParamsDto` in `src/common/dto`
- Created `PaginatedResponse` interface in `src/common/interfaces`
- Created `paginate` utility in `src/common/utils`
- Refactored `ProductModule` (Controller/Service/Repository) to use the new standard.

**Files:**
- src/common/dto/pagination-params.dto.ts
- src/common/interfaces/paginated-response.interface.ts
- src/common/utils/pagination.util.ts
- src/module/product/product.controller.ts
- src/module/product/product.service.ts
- src/module/product/product.repository.ts

**Flow:**
Request (Query Params) -> PaginationParamsDto -> Service -> Repository -> paginate utility -> PaginatedResponse -> TransformInterceptor

**Timestamp:** 2026-02-11

## Narrative
### Structure
- `src/common/dto/pagination-params.dto.ts`
- `src/common/interfaces/paginated-response.interface.ts`
- `src/common/utils/pagination.util.ts`

### Dependencies
- Dependency: `class-validator`, `class-transformer` for DTO validation
- Dependency: `src/common/interceptors/transform.interceptor.ts` for top-level response wrapping

### Features
- Standardized `PaginationParamsDto` with `page` and `limit` defaults (1 and 10).
- `PaginatedResponse<T>` interface for type-safe metadata.
- `paginate` utility for consistent calculation of `totalItems`, `itemCount`, `itemsPerPage`, `totalPages`, and `currentPage`.
