# Module Specification: Product & Batch Management

## 1. Overview

This module handles the lifecycle of Products and their associated Batches. In this system, inventory is **Batch-Centric**. A `Product` defines the item metadata, while a `Batch` represents the physical stock with a specific expiration date.

## 2. Business Rules (Core Logic)

- **SKU Uniqueness:** Every product must have a unique SKU.
- **Shelf Life:** Products have a `shelf_life_days` attribute used to calculate the expiry date of new batches.
- **Batch Expiry Calculation:** When creating a batch: `expiry_date = today + shelf_life_days`.
- **Inventory Initialization:** Upon creating a new Batch, the system must automatically create an entry in the `inventory` table for the Central Kitchen warehouse with an initial quantity.
- **Atomic Transactions:** Creating a Batch and initializing its Inventory must be wrapped in a single database transaction.

## 3. Database Schema Reference

Refer to `src/database/schema.ts` for:

- `products`: `id`, `name`, `sku`, `shelfLifeDays`, `categoryId`, etc.
- `batches`: `id`, `productId`, `batchCode`, `expiryDate`, `createdAt`.
- `inventory`: `warehouseId`, `batchId`, `quantity`, `reservedQuantity`.

## 4. Folder Structure

```text
src/module/product/
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   └── create-batch.dto.ts
├── product.controller.ts
├── product.service.ts
├── product.repository.ts
└── product.module.ts

```

## 5. Implementation Details

### A. Repository (`product.repository.ts`)

Must use the `UnitOfWork` or raw Drizzle `db` instance to perform:

- Standard CRUD for Products.
- `createBatchWithInventory`: A transaction that inserts a new Batch and an initial Inventory record.

### B. Service (`product.service.ts`)

- `createProduct`: Check for SKU existence before saving.
- `createBatch`:

1. Retrieve `shelfLifeDays` from the Product.
2. Calculate `expiryDate`.
3. Call repository to save Batch + Inventory.

### C. Controller (`product.controller.ts`)

- `POST /products`: (Role: MANAGER) Create metadata.
- `GET /products`: (Role: ALL) List products with pagination/search.
- `GET /products/:id`: (Role: ALL) Get product details and its active batches.
- `POST /products/:id/batches`: (Role: KITCHEN) Create a new batch for a specific product.

## 6. DTO Specifications

### `CreateProductDto`

- `name`: string, required.
- `sku`: string, required, unique.
- `shelfLifeDays`: number, required, minimum 1.
- `categoryId`: number, required.

### `CreateBatchDto`

- `batchCode`: string, required.
- `initialQuantity`: number, required, minimum 0.
- `warehouseId`: number, required (Default to Central Kitchen ID).

## 7. Expected Response Format

All API responses must be intercepted by the global `TransformInterceptor` to ensure the following JSON structure:

```json
{
  "statusCode": number,
  "message": string,
  "data": any
}

```
