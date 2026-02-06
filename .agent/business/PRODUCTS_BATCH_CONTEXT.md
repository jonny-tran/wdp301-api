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

### 1. Đặc tả Schema & Endpoints (Documentation)

#### **A. Database Schema (Updated)**

- **Table `base_units**`: Danh mục đơn vị tính.
- `id` (Serial, PK)
- `name` (Text, Unique): Tên đơn vị (Kg, Miếng, Gói...).
- `isActive` (Boolean): Mặc định `true`. Xóa mềm sẽ chuyển về `false`.

- **Table `products**`: Thông tin sản phẩm.
- `baseUnitId` (Integer, FK): Liên kết tới `base_units.id`.

#### **B. Base Unit API Endpoints**

| Method     | Endpoint          | Role          | Description                                             |
| ---------- | ----------------- | ------------- | ------------------------------------------------------- |
| **GET**    | `/base-units`     | ALL           | Lấy danh sách đơn vị đang hoạt động (`isActive: true`). |
| **POST**   | `/base-units`     | ADMIN/MANAGER | Tạo đơn vị mới.                                         |
| **PATCH**  | `/base-units/:id` | ADMIN/MANAGER | Cập nhật tên hoặc mô tả đơn vị.                         |
| **DELETE** | `/base-units/:id` | ADMIN/MANAGER | Xóa mềm đơn vị (chuyển `isActive` thành `false`).       |

---

### 2. Cập nhật Repository (Join dữ liệu)

Để trả về `baseUnitName`, chúng ta cần sử dụng **Inner Join** trong Drizzle.

**File: `src/module/product/product.repository.ts**`

```typescript
async findAll(filter: ProductFilterDto) {
  // ... (logic filter cũ)

  const data = await this.db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      shelfLifeDays: schema.products.shelfLifeDays,
      imageUrl: schema.products.imageUrl,
      isActive: schema.products.isActive,
      baseUnitId: schema.products.baseUnitId,
      baseUnitName: schema.baseUnits.name, // Lấy name từ bảng base_units
    })
    .from(schema.products)
    .innerJoin(schema.baseUnits, eq(schema.products.baseUnitId, schema.baseUnits.id))
    .where(and(...whereConditions))
    .limit(limit)
    .offset(offset);

  return { data, total };
}

async findById(id: number) {
  const [result] = await this.db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      shelfLifeDays: schema.products.shelfLifeDays,
      imageUrl: schema.products.imageUrl,
      baseUnitId: schema.products.baseUnitId,
      baseUnitName: schema.baseUnits.name,
    })
    .from(schema.products)
    .innerJoin(schema.baseUnits, eq(schema.products.baseUnitId, schema.baseUnits.id))
    .where(eq(schema.products.id, id));
  return result;
}

```

---

### 3. Cập nhật Service (Logic xử lý)

**File: `src/module/product/product.service.ts**`

```typescript
async createProduct(dto: CreateProductDto) {
  const sku = SkuUtil.generateProductSku(dto.name || '');

  // Kiểm tra SKU trùng lặp
  const existingSku = await this.productRepository.findBySku(sku);
  if (existingSku) throw new BadRequestException('Mã SKU đã tồn tại');

  // Tạo sản phẩm
  const newProduct = await this.productRepository.create({
    ...dto,
    sku,
  });

  // Truy vấn lại để lấy kèm baseUnitName trả về cho FE
  return await this.productRepository.findById(newProduct.id);
}

async updateProduct(id: number, dto: UpdateProductDto) {
  const product = await this.productRepository.findById(id);
  if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

  await this.productRepository.update(id, dto);

  // Trả về dữ liệu mới nhất kèm baseUnitName
  return await this.productRepository.findById(id);
}

```

---

### 4. Cập nhật DTO (Frontend truyền ID)

Frontend bây giờ sẽ truyền `baseUnitId` (kiểu số) thay vì chuỗi.

**File: `src/module/product/dto/create-product.dto.ts**`

```typescript
export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsInt() // Đổi từ IsString thành IsInt
  baseUnitId: number;

  @IsInt()
  @Min(1)
  shelfLifeDays: number;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
```

---

### 5. Kết quả Response mẫu (Bản tiếng Việt)

Khi bạn gọi `GET /products/1`, response sẽ có cấu trúc như sau:

```json
{
  "statusCode": 200,
  "message": "Lấy chi tiết sản phẩm thành công",
  "data": {
    "id": 1,
    "name": "Gà Rán KFC Original",
    "sku": "P-GRKO-A1B2C3",
    "baseUnitId": 5,
    "baseUnitName": "Miếng",
    "shelfLifeDays": 3,
    "imageUrl": "https://cdn.com/ga-ran.jpg"
  }
}
```

### **Lưu ý của Tech Lead:**

1. **CamelCase:** Tôi đã chuyển toàn bộ response key sang camelCase (`baseUnitName`, `shelfLifeDays`, `baseUnitId`).
2. **Join:** Luôn sử dụng `innerJoin` khi lấy danh sách sản phẩm để đảm bảo không bị lỗi hiển thị nếu một sản phẩm thiếu đơn vị tính (dù DB đã ràng buộc `notNull`).
3. **Soft Delete cho Base Unit:** Trong API `DELETE /base-units/:id`, hãy nhớ chỉ update `isActive = false` để tránh phá hỏng dữ liệu của các `Product` cũ đang tham chiếu tới đơn vị đó.
