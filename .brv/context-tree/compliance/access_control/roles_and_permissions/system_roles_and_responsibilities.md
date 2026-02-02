## Raw Concept
**Task:**
Define System Roles and Permissions

**Changes:**
- Mapped actor definitions from SRS to system roles and permissions.

**Files:**
- src/database/schema.ts
- src/module/auth/dto/create-user.dto.ts

**Flow:**
User Login -> JWT Payload (includes role) -> RolesGuard -> Endpoint Access

**Timestamp:** 2026-02-01

## Narrative
### Structure
- `src/database/schema.ts`: Defines the `role` enum with all 5 roles.\n- `src/module/auth/dto/create-user.dto.ts`: Contains the `UserRole` TypeScript enum.

### Dependencies
- `roleEnum` in `src/database/schema.ts`\n- `RolesGuard` in `src/module/auth/guards/roles.guard.ts`

### Features
- **Franchise Store Staff**: Mobile platform. Responsible for creating orders, receiving goods, and reporting issues (claims).\n- **Central Kitchen Staff**: Mobile platform. Responsible for picking (batch scanning), production, and stock-in/out.\n- **Supply Coordinator**: Web platform. Responsible for approving/adjusting orders, assigning drivers, and resolving claims.\n- **Manager**: Web platform. Responsible for managing master data (recipes, products, prices) and viewing reports.\n- **Admin**: Web platform. Responsible for user management, system configuration, and logs.
