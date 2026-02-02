## Raw Concept
**Task:**
Define Architecture Standard

**Changes:**
- Standardized module structure across `auth`, `inventory`, `order`, and `shipment` modules.

**Files:**
- src/module/auth/auth.controller.ts
- src/module/auth/auth.service.ts
- src/module/auth/auth.repository.ts

**Flow:**
Request -> Controller -> Service -> Repository -> Database

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/module/<name>/<name>.controller.ts`\n- `src/module/<name>/<name>.service.ts`\n- `src/module/<name>/<name>.repository.ts`

### Dependencies
- NestJS framework\n- Repository injected into Service, Service injected into Controller

### Features
- Controllers handle HTTP requests and DTO validation\n- Services contain business logic (FEFO, Partial Fulfillment, etc.)\n- Repositories handle database interactions via Drizzle ORM
