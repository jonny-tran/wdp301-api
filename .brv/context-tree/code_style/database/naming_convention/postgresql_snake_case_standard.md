## Relations
@structure/data_models/schema.md

## Raw Concept
**Task:**
Define Database Naming Convention

**Changes:**
- Ensured all `pgTable` definitions in `schema.ts` use snake_case for column names.

**Files:**
- src/database/schema.ts

**Flow:**
TypeScript Property (camelCase) -> Drizzle Mapping -> DB Column (snake_case)

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/database/schema.ts`: Defines the mapping between TypeScript objects and snake_case database columns.

### Dependencies
- Drizzle ORM\n- PostgreSQL database

### Features
- Database tables and columns must use `snake_case` (e.g., `batch_id`, `expiry_date`)
