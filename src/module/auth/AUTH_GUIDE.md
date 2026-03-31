# AUTH Module — Identity & Access Management

**Project:** SP26SWP07 — Central Kitchen & Franchise Supply  
**Scope:** JWT authentication, refresh tokens, RBAC, and **store-scoped data isolation**.

---

## 1. Core business mechanics

### 1.1 JWT (access token)

- After successful login, the API returns a short-lived **access token** (JWT) signed with `JWT_ACCESS_SECRET`.
- Clients send it as: `Authorization: Bearer <accessToken>`.
- The payload shape stored in the token is `IJwtPayload`: `sub` (user id), `email`, `role`, optional `storeId`.
- Passport JWT strategy (`AuthStrategy`) maps the payload to `request.user`: `{ userId, email, role, storeId }`.

### 1.2 Refresh token

- A long-lived **refresh token** is issued at login (signed with `JWT_REFRESH_SECRET`).
- It is **persisted** in `refresh_tokens` (hashed token row per user session policy in `AuthRepository`).
- `POST /auth/refresh-token` verifies the JWT, ensures the token still exists in DB (rotation: old row deleted, new pair issued), then returns **new** `accessToken` + `refreshToken`.
- `POST /auth/logout` accepts a refresh token body and deletes that row from DB.

> **Note**  
> If the access token expires, the client should call refresh; if refresh fails, re-login is required.

### 1.3 RBAC (Role-Based Access Control)

- **Roles** are enforced with:
  - **`AtGuard`** — class `AtGuard` in `guards/auth.guard.ts` (extends `AuthGuard('jwt')`). Validates Bearer JWT and attaches `user` to the request.
  - **`RolesGuard`** — reads allowed roles from the `@Roles(...)` decorator; compares to `request.user.role`.
- Controller pattern: `@UseGuards(AtGuard, RolesGuard)` + `@Roles(UserRole.SOME_ROLE)` on handlers that need both authentication and role checks.

### 1.4 Data isolation (store boundary)

- Users with role **`franchise_store_staff`** carry `storeId` on the JWT (and in DB).
- **Isolation rule:** services must restrict queries to entities whose `store_id` (or destination warehouse linked to that store) matches `user.storeId`.
- Central roles (`admin`, `manager`, `supply_coordinator`, `central_kitchen_staff`) typically see broader datasets; exact filters are implemented **per module** (orders, shipments, claims, inventory).

---

## 2. Role matrix (RBAC + data scope)

| Role | Scope / what they usually see |
|------|-------------------------------|
| **admin** | Global users (create/list/update), roles metadata, full shipment list (when exposed), system-wide operations as coded per controller. |
| **manager** | Store CRUD (`/stores`), suppliers write, products write, claims resolution, many analytics endpoints, user management not default on all routes — follow each `@Roles`. |
| **supply_coordinator** | Supply planning: orders, shipments listing, picking views, claims list/detail/resolve as allowed. |
| **central_kitchen_staff** | Central warehouse operations: inbound, production, inventory adjustments as per module `@Roles`; not on `GET /shipments` list (that route is Manager/Coordinator/Admin in current code). |
| **franchise_store_staff** | **Store-bound:** must have `storeId`. Only data for their store (e.g. `GET /shipments/store/my`, shipment detail if `toWarehouse` belongs to store, manual claims only for their store’s shipments). |

> **Warning**  
> RBAC alone is not enough: **always apply `storeId` filters in services/repositories** for franchise staff so IDOR is impossible even if someone guesses UUIDs.

---

## 3. API specification (Auth controller)

Global prefix may be applied by the app (e.g. `/api`); paths below are **controller routes** under `@Controller('auth')`.

### 3.1 `POST /auth/login`

| Item | Detail |
|------|--------|
| **Guards** | None |
| **Request body (`LoginDto`)** | `email` (string, trimmed/lowercased), `password` (string, min 6) |
| **Response** | `userId`, `email`, `username`, `role`, `storeId`, `accessToken`, `refreshToken` |

### 3.2 `POST /auth/refresh-token`

| Item | Detail |
|------|--------|
| **Guards** | None |
| **Request body (`RefreshTokenDto`)** | `refreshToken` (string) |
| **Response** | `accessToken`, `refreshToken` |

### 3.3 `GET /auth/me` (Profile)

| Item | Detail |
|------|--------|
| **Guards** | `AtGuard` only |
| **Request** | Bearer access token |
| **Response** | User profile: `id`, `email`, `username`, `role`, `storeId`, `status`, `createdAt`, … (see `AuthService.getMe`) |

### 3.4 User provisioning (not public “register”)

| Item | Detail |
|------|--------|
| **Endpoint** | `POST /auth/create-user` |
| **Guards** | `AtGuard`, `RolesGuard` + `@Roles(UserRole.ADMIN)` |
| **Request body (`CreateUserDto`)** | `username`, `email`, `password` (min 6), `role` (`UserRole` enum), optional `storeId` (required for franchise staff in practice) |
| **Response** | Created user payload from service |

> **Note**  
> There is **no** open self-service registration endpoint in this module; accounts are created by **Admin**.

### 3.5 Other auth endpoints (reference)

- `POST /auth/logout` — `AtGuard` + body `LogoutDto` (`refreshToken`).
- `PATCH /auth/profile` — `AtGuard`; updates own profile (`UpdateProfileDto`).
- `GET /auth/users`, `PATCH /auth/users/:id` — Admin-only user administration.

---

## 4. Notes for AI IDE (Cursor) — `@CurrentUser()`

**File:** `decorators/current-user.decorator.ts`

- Injects `request.user` populated by JWT strategy.
- Usage: `@CurrentUser() user: RequestWithUser['user']` or `@CurrentUser() user: IJwtPayload`-shaped object (handlers often use the mapped shape with `userId`).
- **Partial pick:** `@CurrentUser('storeId') storeId: string | null | undefined` returns only that property.

**Isolation pattern in services**

```typescript
async example(@CurrentUser() user: RequestWithUser['user']) {
  if (user.role === UserRole.FRANCHISE_STORE_STAFF) {
    if (!user.storeId) throw new ForbiddenException(...);
    // pass user.storeId into repository filters
  }
}
```

Do not trust `storeId` from query/body for franchise staff; **override** with `user.storeId` where the spec requires store isolation.

---

## 5. Frontend guide

### 5.1 Storing tokens

- Keep **access token** in memory or short-lived storage; persist **refresh token** securely (httpOnly cookie preferred; if localStorage, be aware of XSS risk).
- Send `Authorization: Bearer <accessToken>` on each API call.

### 5.2 Handling `401 Unauthorized`

- On `401`, attempt **one** `POST /auth/refresh-token` with the stored refresh token.
- If refresh succeeds, retry the failed request with the new access token.
- If refresh fails, clear tokens and redirect to **login**.

### 5.3 Post-login redirect by role

Map `role` from login response:

| Role | Suggested home |
|------|----------------|
| `franchise_store_staff` | Store dashboard (incoming shipments, receive flow, my-store claims). |
| `central_kitchen_staff` | Kitchen / inbound / production screens. |
| `supply_coordinator` | Orders, shipments, manifests, coordinator queues. |
| `manager` | Stores, suppliers, analytics, approvals. |
| `admin` | User management + global configuration. |

---

## 6. File map

| Concern | Location |
|---------|----------|
| HTTP routes | `auth.controller.ts` |
| Login / refresh / profile logic | `auth.service.ts` |
| JWT strategy | `strategies/auth.strategy.ts` |
| Access JWT guard | `guards/auth.guard.ts` (`AtGuard`) |
| Roles guard | `guards/roles.guard.ts` |
| Roles decorator | `decorators/roles.decorator.ts` |
| Current user decorator | `decorators/current-user.decorator.ts` |
| Token signing | `helper/token.service.ts` |
