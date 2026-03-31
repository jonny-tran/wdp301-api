# SUPPLIER Module — Vendor Management

**Project:** SP26SWP07  
**Role in chain:** Suppliers are the **counterparty on inbound receipts** (`receipts.supplier_id`). They are the **origin** of purchased stock that becomes **batches** and **inventory** at central warehouse through the **inbound** module.

---

## 1. Core business role

| Concern | How suppliers participate |
|---------|---------------------------|
| **Purchase-to-stock** | Receipts reference `supplierId`; line items accept quantities and tie to products/batches. |
| **Traceability** | Batch lineage may start from supplier receipt metadata (manufacture/expiry on lines). |
| **Master data** | Maintain legal/ops identity: name, contact, phone, address, `isActive`. |

---

## 2. Access control (current code)

| Action | Roles |
|--------|-------|
| `POST /suppliers`, `PATCH /suppliers/:id`, `DELETE /suppliers/:id` | **`manager`** (`RolesGuard` on method) |
| `GET /suppliers`, `GET /suppliers/:id` | Any **authenticated** user (`AtGuard` on controller only — no `RolesGuard`) |

> **Note**  
> **`admin`** is **not** explicitly granted** on write routes today — only `manager`. Extend `@Roles` if admins must CRUD suppliers.

**Supply coordinator** can **read** the catalog for operational context (ordering/receiving UI).

---

## 3. API specification

**Controller:** `@Controller('suppliers')`, global `AtGuard`, Bearer auth.

### 3.1 `GET /suppliers`

| Item | Detail |
|------|--------|
| **Query (`GetSuppliersDto`)** | Pagination (`page`, `limit`, `sortBy`, `sortOrder`), optional `search` (matches **name** via ilike in repository map), optional `isActive`. |
| **Response** | Paginated `items` + `meta` (standard `paginate` helper). |

### 3.2 `POST /suppliers`

| Item | Detail |
|------|--------|
| **Guards** | `AtGuard`, `RolesGuard`, `@Roles(manager)` |
| **Body (`CreateSupplierDto`)** | `name` (required), optional `contactName`, `phone` (Vietnamese mobile regex), `address`, `isActive` (default true). |
| **Response** | Created supplier row. |

### 3.3 `PATCH /suppliers/:id`

| Item | Detail |
|------|--------|
| **Guards** | Manager + roles guard |
| **Param** | `id` — numeric string parsed with `+id` in controller |
| **Body** | `UpdateSupplierDto` (partial fields) |
| **Response** | Updated row |

### 3.4 `DELETE /suppliers/:id`

| Item | Detail |
|------|--------|
| **Behavior** | **Soft delete:** sets `isActive: false` (`SupplierRepository.softDelete`). |

### 3.5 `GET /suppliers/:id`

| Item | Detail |
|------|--------|
| **Response** | Supplier + **recent receipts** (`receipts` relation, ordered by `createdAt` desc, **limit 5**). |
| **Inactive** | Throws `NotFoundException` if `isActive` is false. |

> **Gap vs ideal spec**  
> There is **no dedicated “all batches from supplier”** endpoint — traceability is indirect via **receipts → receipt_items → batches**. Extend repository if full history is required.

---

## 4. Notes for Cursor (AI IDE)

1. **Product linkage:** The current `products` table has **no `supplier_id`**. A supplier “supplies many products” is modeled through **receipt lines**, not a static many-to-many in schema. When deleting suppliers, check **receipts** (and business rules), not `products.supplier_id`.
2. **Unique supplier `code`:** The **schema does not define** a separate `code` column — uniqueness is effectively on **identity/id** and operational **name** search. If you add `code`, enforce **DB unique constraint** and document it here.
3. **Soft delete:** “Delete” keeps the row; filters use `isActive`.

---

## 5. Frontend guide

### 5.1 Management table

- Call `GET /suppliers` with `search` and `isActive` toggles.
- Show name, contact, phone, active badge.

### 5.2 Create / edit form

- **Phone:** enforce the same pattern as backend: Vietnamese mobile `^(0[35789])+([0-9]{8})$` (see `CreateSupplierDto`).
- **Email:** not in current `CreateSupplierDto` — add field + migration if needed.

### 5.3 Detail view

- Show supplier header + **last 5 receipts** from `GET /suppliers/:id`; link to inbound receipt detail screens.

---

## 6. File map

| File | Role |
|------|------|
| `supplier.controller.ts` | HTTP API |
| `supplier.service.ts` | Validation orchestration |
| `supplier.repository.ts` | CRUD, pagination, `findById` with receipts |
| `dto/create-supplier.dto.ts` | Create validation |
| `dto/get-suppliers.dto.ts` | List query |
| `dto/update-supplier.dto.ts` | Patch validation |
