# 📑 INBOUND LOGISTICS LOGIC REFACTORING GUIDE (SP26SWP07)

## 🎯 Objective

Complete the Inbound Logistics module for the Central Kitchen system based on the KFC model. Ensure data integrity and compliance with core business rules regarding Batch Management.

## 🛠 Tech Stack

- **Framework:** NestJS
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL

---

## 📋 Task List (AI Instructions)

### Task 1: Atomic Transaction in `completeReceipt`

- **File:** `src/module/inbound/inbound.service.ts`
- **Requirement:** Wrap the entire completion logic within a `Database Transaction`.
- **Logic:**

1. Validate receipt status (`status === 'draft'`).
2. Iterate through the receipt's item list.
3. For each item: Perform **Inventory Upsert** and **Log Transaction**.
4. Update receipt status to `completed`.

- **Note:** If any step fails, the entire process must be rolled back.

### Task 2: Inventory Upsert (using `onConflictDoUpdate`)

- **Requirement:** When a batch is received into the warehouse, the system must automatically check if the inventory record already exists.
- **Query:** Use `.insert().onConflictDoUpdate()`.
- **Target:** Composite key `[warehouse_id, batch_id]`.
- **Action:**
- If it does not exist: Insert a new record.
- If it exists: Update by incrementing: .

### Task 3: Audit Log (Inventory Transactions)

- **Target Table:** `inventory_transactions`.
- **Data:** - `type`: 'import'
- `quantityChange`: The actual quantity received.
- `referenceId`: Map to the Receipt ID (e.g., `RC-12345`).

- **Purpose:** Ensure full Traceability.

### Task 4: Expiry Date Validation (Expiry Warning)

- **Action:** Implement within the `addItemToReceipt` API.
- **Rule:** If the product's , generate a warning.
- **Response Data:** Add a `warning: string` field in the response so the Mobile App can display a confirmation popup for the Kitchen Staff.

---

## ⚠️ Immutable Business Rules

1. **Batch-Centric:** Never aggregate stock by Product only. Stock must always be linked to a specific `batch_id`.
2. **Naming Standard:** Use **camelCase** for all fields in the Response. Do not use abbreviations (e.g., use `quantity` instead of `qty`, `expiryDate` instead of `exp`).
3. **Draft First:** Inventory quantity only increases in physical stock when the receipt status is set to `completed`.

---

## 🤖 AI Instructions

> "Based on the tasks listed above, refactor `inbound.service.ts` and add the necessary functions to `inbound.repository.ts`. Always ensure the use of defined schemas and strictly adhere to Clean Code standards."
