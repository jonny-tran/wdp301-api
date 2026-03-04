## Relations
@compliance/access_control/roles_and_permissions/system_roles_and_responsibilities.md

## Raw Concept
**Task:**
Implement User Management and Role-Based Access Control (RBAC)

**Changes:**
- Added AuthController with login, logout, refresh-token, and user management endpoints
- Implemented AuthService for user authentication and profile management
- Created AuthRepository using Drizzle ORM for user and token data access
- Added RolesGuard and AtGuard for securing endpoints based on JWT and UserRole
- Implemented TokenService for JWT access and refresh token generation
- Added GetUsersDto with pagination and filtering support for admin user list

**Files:**
- src/module/auth/auth.controller.ts
- src/module/auth/auth.service.ts
- src/module/auth/auth.repository.ts
- src/module/auth/guards/roles.guard.ts
- src/module/auth/guards/auth.guard.ts
- src/module/auth/dto/create-user.dto.ts
- src/module/auth/dto/get-users.dto.ts

**Flow:**
request -> AtGuard (JWT verify) -> RolesGuard (Role check) -> Controller -> Service -> Repository

**Timestamp:** 2026-02-24

**Author:** ByteRover

## Narrative
### Structure
Authentication and User Management are centralized in src/module/auth. It uses a repository pattern with Drizzle ORM. Security is enforced via NestJS Guards (AtGuard for JWT validation and RolesGuard for RBAC).

### Dependencies
Uses @nestjs/jwt for token operations, argon2 for password hashing, and Passport for JWT strategy.

### Features
Supports JWT-based authentication with refresh token rotation, password reset via OTP (MailService), and Admin-only user management (creation, status updates, role-based filtering).

### Rules
Rule 1: ADMIN role cannot be created via public or staff endpoints.
Rule 2: FRANCHISE_STORE_STAFF requires a valid storeId.
Rule 3: User status "banned" prevents login.
Rule 4: Profile updates are restricted to non-sensitive fields (username, phone, email).

### Examples
Admin creating a user: POST /auth/create-user with CreateUserDto. Admin listing users: GET /auth/users?role=manager&status=ACTIVE.
