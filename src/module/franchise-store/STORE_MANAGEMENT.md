# FRANCHISE STORE Module — Store & Internal Inventory Context

**Project:** SP26SWP07  
**Purpose:** Master data for **franchise stores** and provisioning of each store’s **internal warehouse** (`store_internal`).

---

## 1. Entity model

### 1.1 `stores` (franchise store)

- Holds identity and operational attributes: `name`, `address`, `managerName`, `phone`, `isActive`, optional `maxStorageCapacity`, `transitTimeHours` (lead time hint).

### 1.2 `warehouses` — relationship

- On **create store**, the service runs a transaction:
  1. Insert into `stores`.
  2. Call `WarehouseService.createDefaultWarehouse(store.id, store.name, tx)` → creates a warehouse with **`type = store_internal`** linked to that `storeId`.

> **Rule**  
> Each franchise store is expected to have **one internal warehouse** used for store-level inventory, receiving shipments from central, and stock checks.

### 1.3 Diagram (conceptual)

```text
stores (1) ──► warehouses (N)   [currently: default 1 × store_internal per store]
```

---

## 2. Inventory visibility (store isolation)

- **Franchise store staff** resolve their warehouse via `storeId` on the JWT → inventory queries must filter by that warehouse (see `InventoryRepository.findWarehouseByStoreId` patterns in shipment/inventory modules).
- **Managers / coordinators / admin** can list all stores and use `storeId` query params on cross-store APIs where implemented.

> **Warning**  
> This module does **not** expose a dedicated “store inventory only” CRUD; stock is manipulated through **inventory**, **shipment receive**, and **claim** flows. Always enforce `storeId` in guards + services for staff.

---

## 3. API specification (`@Controller('stores')`)

All routes: `AtGuard` + `RolesGuard` + Bearer auth.

| Method & path | Roles | Description |
|---------------|-------|-------------|
| `POST /stores` | `manager` | Create store + default internal warehouse. |
| `GET /stores` | `admin`, `manager`, `supply_coordinator` | Paginated list (`GetStoresFilterDto`; default active stores). |
| `GET /stores/:id` | `manager` | Store detail by UUID. |
| `PATCH /stores/:id` | `manager` | Update store. |
| `DELETE /stores/:id` | `manager` | Soft deactivate (`isActive: false`). |
| `GET /stores/analytics/reliability` | `manager` | Store reliability / fraud-style signals. |
| `GET /stores/analytics/demand-pattern` | `manager` | Demand pattern by weekday (`DemandPatternQueryDto`). |

### 3.1 DTO highlights

- **`CreateStoreDto` / `UpdateStoreDto`:** name, address, optional manager/phone/capacity/transit fields — see Swagger / class files.
- **`GetStoresFilterDto`:** pagination + optional `search`, `isActive`.

> **Note**  
> In the current codebase, **Admin** can **list** stores but **create/update/delete** are **`manager`-only**. Adjust docs/UI if product owners want Admin CRUD.

---

## 4. “Dashboard” & analytics (current vs suggested)

**Implemented in this module**

- `GET /stores/analytics/reliability`
- `GET /stores/analytics/demand-pattern`

**Not implemented as a single “dashboard” aggregate in this module**

- Count of **orders in flight**, **open claims**, etc. — the FE should compose:
  - **Orders:** order module APIs filtered by `storeId` (coordinator/manager) or staff-specific endpoints where available.
  - **Claims:** `GET /claims/my-store` for franchise staff; `GET /claims` with `storeId` for back office.
  - **Shipments:** `GET /shipments/store/my` for incoming trips.

Document this so the FE does not expect one mythical `/stores/:id/dashboard` unless you add it later.

---

## 5. Integration with Order & Shipment

| Consumer | How `store_id` is used |
|----------|-------------------------|
| **Orders** | `orders.store_id` identifies the requesting franchise; approval/shipment builders resolve `toWarehouseId` from the store’s internal warehouse. |
| **Shipments** | `GET /shipments` accepts optional `storeId` query; franchise staff use `GET /shipments/store/my` which **injects** JWT `storeId`. |
| **Claims** | Repository filters claims by deriving shipment ids for a given `storeId`. |

---

## 6. Frontend guide

### 6.1 Displaying store context

- After login, read `storeId` + store name (from profile or a `GET /stores/:id` if the user is manager fetching detail).
- Show store name, address, and contact in a header/sidebar.

### 6.2 Switching stores (multi-branch manager)

- **Current API:** managers list stores via `GET /stores`; there is **no** “act as store” token switch in auth — the JWT is user-scoped.
- Options:
  - **UI-only filter:** manager selects a store id in dashboard widgets (pass `storeId` query to list endpoints that support it).
  - **Future:** impersonation or separate staff accounts per branch.

---

## 7. Route ordering caveat

Ensure static paths like `analytics/...` are registered **before** `GET /stores/:id` if you ever collapse analytics under a single segment; current paths use **two segments** (`analytics/reliability`) and are safe against `:id` stealing `analytics`.

---

## 8. File map

| File | Role |
|------|------|
| `franchise-store.controller.ts` | HTTP API |
| `franchise-store.service.ts` | Create + analytics |
| `franchise-store.repository.ts` | Persistence |
| `dto/*.ts` | Input validation |
