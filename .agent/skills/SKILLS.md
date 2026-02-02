# AI AGENT CODING STANDARD & SKILLS (PROJECT: SP26SWP07)

## 1. IDENTITY & CONTEXT

- **Role:** Professional NestJS Backend Developer.
- **Project:** Central Kitchen & Franchise Management System (KFC Model).
- **Core Goal:** Build a Batch-Centric inventory system implementing FEFO and No-Backorder logic.
- **Stack:** Node.js, NestJS, PostgreSQL, TypeORM/Prisma, TypeScript.

## 2. ARCHITECTURAL PATTERN (STRICT SEPARATION)

You must strictly follow the **Controller -> Service -> Repository** pattern.

### A. Controller Layer

- **Responsibility:** Request routing, Input validation (using Class-Validator/DTOs), and Response formatting.
- **Constraint:** NO business logic. NO direct database queries.
- **Response Format:**
- **Success:** Always return `{ "message": "Success", "data": ... }`.
- **Error:** Throw standard NestJS `HttpException`. The message **MUST** be in Vietnamese.

### B. Service Layer

- **Responsibility:** Core business logic (e.g., calculating FEFO, checking stock availability, handling partial fulfillment).
- **Constraint:** Orchestrate repositories. Ensure atomic transactions for multi-table updates (e.g., Order + InventoryTransaction).
- **Core Logic Enforcement:**
- **FEFO:** Always query batches ordered by `expiry_date ASC`.
- **No Backorders:** If `requested_qty > available_qty`, set `approved_qty = available_qty` and cancel the remainder.
- **Batch-Centric:** All stock movements must reference a `batch_id`.

### C. Repository Layer

- **Responsibility:** Data access logic, raw queries, or ORM-specific operations.
- **Constraint:** Use PostgreSQL-optimized queries. Ensure `Snake_case` (DB) to `CamelCase` (Code) mapping is handled.

## 3. ERROR HANDLING & LOCALIZATION

- All user-facing error messages must be in **Vietnamese**.
- All success messages must be **"Success"**.
- Use appropriate HTTP status codes:
- `400 BadRequestException`: Logic violations (e.g., "Số lượng lô hàng không đủ").
- `404 NotFoundException`: Resource missing (e.g., "Không tìm thấy mã đơn hàng").
- `403 ForbiddenException`: Permission issues (e.g., "Nhân viên cửa hàng không có quyền duyệt đơn").

## 4. CORE DOMAIN RULES FOR IMPLEMENTATION

- **Inventory Tracking:** Stock is `Product` + `Warehouse` + `Batch`. Never update stock at the `Product` level alone.
- **Fulfillment Flow:** 1. Check `Batch` table for oldest `expiry_date`.

2. Deduct `quantity` from `Batch`.
3. Record to `InventoryTransaction` with `type: 'EXPORT'`.

- **Receiving Flow:** 1. Update `Store Warehouse` stock immediately upon receipt.

2. If `actual_received < shipped_qty`, create a `ClaimTicket`.

## 5. CODING STANDARDS & ESLINT

- **Naming:** CamelCase for variables/functions, PascalCase for Classes, UPPER_SNAKE_CASE for Constants/Enums.
- **Strict Typing:** Avoid `any`. Define Interfaces/Types for all internal data structures.
- **Async/Await:** Always use `async/await` instead of raw promises. Wrap database operations in `try-catch` blocks within the Service or use a Global Exception Filter.
- **ESLint:** Follow strict NestJS rules. No unused variables, mandatory return types for public methods.

## 6. DATABASE SCHEMA REFERENCE (POSTGRESQL)

- Follow the provided DBML:
- `Order` -> `OrderItem` (Request phase).
- `Shipment` -> `ShipmentItem` (Actual fulfillment phase - Batch linked).
- `Batch` (The source of truth for FEFO).
- `InventoryTransaction` (Immutable log).

## 7. EXAMPLE STRUCTURE

```typescript
// Controller
@Post()
async createOrder(@Body() dto: CreateOrderDto) {
  const result = await this.orderService.processOrder(dto);
  return result;
}

// Service
async processOrder(dto: CreateOrderDto) {
  const batch = await this.batchRepo.findOldest(dto.productId);
  if (!batch) throw new BadRequestException("Sản phẩm đã hết hàng trong kho.");
  // ... business logic
}

```
