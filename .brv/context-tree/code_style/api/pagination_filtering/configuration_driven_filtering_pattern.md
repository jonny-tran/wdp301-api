## Relations
@code_style/api/pagination_filtering/standardized_pagination_and_filtering_pattern.md

## Raw Concept
**Task:**
Implement Configuration-Driven Filtering to simplify repository logic and standardize filter application.

**Changes:**
- Implemented `FilterMap` type and filtering engine in `paginate.util.ts`.
- Refactored `ProductRepository` to use `applyFilters` (or similar engine) with a configuration-driven approach.
- Replaced manual `and()` and `eq()` conditions with a dynamic filter mapping.

**Files:**
- src/common/utils/pagination.util.ts
- src/module/product/product.repository.ts
- src/module/product/dto/product-filter.dto.ts

**Flow:**
DTO -> Repository -> FilterMap Config -> Filtering Engine -> Drizzle Query Object

**Timestamp:** 2026-02-11

## Narrative
### Structure
- `src/common/utils/pagination.util.ts` (Filtering engine)
- `src/module/product/product.repository.ts` (Example implementation)

### Dependencies
- Dependency: `drizzle-orm` for SQL operators (`eq`, `ilike`, `gte`, `lte`, etc.)
- Dependency: `src/common/utils/pagination.util.ts` where `FilterMap` and the filtering engine reside.

### Features
- `FilterMap`: A configuration object mapping DTO keys to database columns and operators.
- Supported Operators: `eq`, `ilike`, `contains`, `gte`, `lte`, `in`.
- Decouples API contract (DTO) from database schema logic.
