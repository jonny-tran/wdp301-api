# 📘 FRONTEND API INTEGRATION GUIDE

> **Dự án**: Central Kitchen & Franchise Supply Chain System (KFC Model)
> **Phiên bản**: v2.0 – Cập nhật 2026-02-25
> **Quy ước**: Tất cả JSON Response sử dụng **camelCase**. Backend dùng Interceptor/ClassTransformer chuyển đổi từ snake_case trong DB sang camelCase cho Frontend.

---

## 📋 MỤC LỤC

1. [Global Response Wrapper](#1-global-response-wrapper)
2. [Enum & Hằng số dùng chung](#2-enum--hằng-số-dùng-chung)
3. [Phân trang (Pagination)](#3-phân-trang-pagination)
4. [Module: Authentication](#4-module-authentication)
5. [Module: Franchise Store](#5-module-franchise-store)
6. [Module: Supplier](#6-module-supplier)
7. [Module: Product & Batch](#7-module-product--batch)
8. [Module: Inbound Logistics](#8-module-inbound-logistics)
9. [Module: Inventory](#9-module-inventory)
10. [Module: Order](#10-module-order)
11. [Module: Warehouse Operation](#11-module-warehouse-operation)
12. [Module: Shipment](#12-module-shipment)
13. [Module: Claim](#13-module-claim)
14. [Module: System Config](#14-module-system-config)
15. [Module: Upload (Cloudinary)](#15-module-upload-cloudinary)
16. [Hướng dẫn luồng nghiệp vụ (Frontend Flows)](#16-hướng-dẫn-luồng-nghiệp-vụ)

---

## 1. Global Response Wrapper

Mọi API Response đều được bọc bởi `TransformInterceptor` theo cấu trúc:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": "<Payload thực tế>",
  "timestamp": "2026-02-25T00:00:00.000Z",
  "path": "/api/endpoint"
}
```

**API phân trang** sẽ trả thêm `meta` bên trong `data`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "items": [],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5
    }
  },
  "timestamp": "...",
  "path": "..."
}
```

**Error Response** (message tiếng Việt):

```json
{
  "statusCode": 400,
  "message": "Số lượng tồn kho không đủ",
  "error": "Bad Request"
}
```

---

## 2. Enum & Hằng số dùng chung

### UserRole

```typescript
enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  SUPPLY_COORDINATOR = 'supply_coordinator',
  CENTRAL_KITCHEN_STAFF = 'central_kitchen_staff',
  FRANCHISE_STORE_STAFF = 'franchise_store_staff',
}
```

### OrderStatus

```typescript
enum OrderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  PICKING = 'picking',
  DELIVERING = 'delivering',
  COMPLETED = 'completed',
  CLAIMED = 'claimed',
}
```

### ShipmentStatus

```typescript
enum ShipmentStatus {
  PREPARING = 'preparing',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
}
```

### ClaimStatus

```typescript
enum ClaimStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
```

### ReceiptStatus

```typescript
enum ReceiptStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
```

### BatchStatus

```typescript
enum BatchStatus {
  PENDING = 'pending',
  AVAILABLE = 'available',
  EMPTY = 'empty',
  EXPIRED = 'expired',
}
```

### TransactionType

```typescript
enum TransactionType {
  IMPORT = 'import',
  EXPORT = 'export',
  WASTE = 'waste',
  ADJUSTMENT = 'adjustment',
}
```

---

## 3. Phân trang (Pagination)

Tất cả API GET danh sách đều kế thừa `PaginationParamsDto`:

| Query Param | Type            | Default | Mô tả                     |
| ----------- | --------------- | ------- | ------------------------- |
| `page`      | number          | 1       | Trang hiện tại (min: 1)   |
| `limit`     | number          | 10      | Số bản ghi/trang (min: 1) |
| `sortBy`    | string          | –       | Sắp xếp theo trường       |
| `sortOrder` | `ASC` \| `DESC` | `DESC`  | Thứ tự sắp xếp            |

---

## 4. Module: Authentication

**Base URL**: `/auth`

### 4.1 Đăng nhập

- **Endpoint**: `POST /auth/login`
- **Roles**: Public (Rate limit: 5 req/min)
- **Request Body** (`LoginDto`):

| Field      | Type   | Bắt buộc | Mô tả                  |
| ---------- | ------ | -------- | ---------------------- |
| `email`    | string | ✅       | Email đăng nhập        |
| `password` | string | ✅       | Mật khẩu (min 6 ký tự) |

- **Response** (`ILoginResponse`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "userId": "uuid-string",
    "email": "admin@gmail.com",
    "username": "Nguyen Van A",
    "role": "admin",
    "storeId": "uuid-or-null",
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### 4.2 Làm mới Token

- **Endpoint**: `POST /auth/refresh-token`
- **Roles**: Public (Rate limit: 5 req/min)
- **Request Body** (`RefreshTokenDto`):

| Field          | Type   | Bắt buộc |
| -------------- | ------ | -------- |
| `refreshToken` | string | ✅       |

- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### 4.3 Xem hồ sơ cá nhân

- **Endpoint**: `GET /auth/me`
- **Roles**: Tất cả (cần Bearer Token)
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": "uuid-string",
    "email": "admin@gmail.com",
    "username": "Nguyen Van A",
    "role": "admin",
    "storeId": "uuid-or-null",
    "status": "ACTIVE",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### 4.4 Đăng xuất

- **Endpoint**: `POST /auth/logout`
- **Roles**: Tất cả (cần Bearer Token)
- **Request Body** (`LogoutDto`):

| Field          | Type   | Bắt buộc |
| -------------- | ------ | -------- |
| `refreshToken` | string | ✅       |

- **Response**: `{ "message": "Đăng xuất thành công" }`

### 4.5 Tạo tài khoản (Admin)

- **Endpoint**: `POST /auth/create-user`
- **Roles**: `ADMIN`
- **Request Body** (`CreateUserDto`):

| Field      | Type          | Bắt buộc                           | Mô tả                      |
| ---------- | ------------- | ---------------------------------- | -------------------------- |
| `username` | string        | ✅                                 | Tên hiển thị               |
| `email`    | string        | ✅                                 | Email (unique)             |
| `password` | string        | ✅                                 | Min 6 ký tự                |
| `role`     | UserRole      | ✅                                 | Không cho phép tạo `admin` |
| `storeId`  | string (UUID) | Nếu role = `franchise_store_staff` | ID cửa hàng                |

- **Response**:

```json
{
  "statusCode": 201,
  "message": "Tạo tài khoản mới thành công",
  "data": {
    "id": "uuid",
    "email": "manager.q1@gmail.com",
    "username": "Nguyen Van A",
    "role": "manager",
    "storeId": null,
    "status": "ACTIVE",
    "createdAt": "2026-02-25T00:00:00.000Z"
  }
}
```

### 4.6 Quên mật khẩu

- **Endpoint**: `POST /auth/forgot-password`
- **Roles**: Public (Rate limit: 5 req/min)
- **Request Body** (`ForgotPasswordDto`):

| Field   | Type   | Bắt buộc |
| ------- | ------ | -------- |
| `email` | string | ✅       |

### 4.7 Đặt lại mật khẩu

- **Endpoint**: `POST /auth/reset-password`
- **Roles**: Public (Rate limit: 1 req/min)
- **Request Body** (`ResetPasswordDto`):

| Field      | Type   | Bắt buộc | Mô tả                |
| ---------- | ------ | -------- | -------------------- |
| `email`    | string | ✅       |                      |
| `code`     | string | ✅       | OTP 6 số             |
| `password` | string | ✅       | Mật khẩu mới (min 6) |

### 4.8 Lấy danh sách vai trò

- **Endpoint**: `GET /auth/roles`
- **Roles**: `ADMIN`
- **Response**: `[{ "value": "manager", "label": "Quản lý" }, ...]`

### 4.9 Quản lý người dùng (Admin)

- **Endpoint**: `GET /auth/users`
- **Roles**: `ADMIN`
- **Query** (`GetUsersDto` extends `PaginationParamsDto`):

| Query    | Type                   | Mô tả              |
| -------- | ---------------------- | ------------------ |
| `role`   | UserRole               | Lọc theo vai trò   |
| `status` | `ACTIVE` \| `INACTIVE` | Lọc trạng thái     |
| `search` | string                 | Tìm theo tên/email |

### 4.10 Cập nhật người dùng (Admin)

- **Endpoint**: `PATCH /auth/users/:id`
- **Roles**: `ADMIN`
- **Request Body** (`UpdateUserByAdminDto`):

| Field    | Type                   | Bắt buộc |
| -------- | ---------------------- | -------- |
| `status` | `ACTIVE` \| `INACTIVE` | ❌       |
| `role`   | UserRole               | ❌       |
| `email`  | string                 | ❌       |
| `phone`  | string                 | ❌       |

### 4.11 Cập nhật hồ sơ cá nhân

- **Endpoint**: `PATCH /auth/profile`
- **Roles**: Tất cả (cần Bearer Token)
- **Request Body** (`UpdateProfileDto`):

| Field      | Type   | Bắt buộc |
| ---------- | ------ | -------- |
| `fullName` | string | ❌       |
| `phone`    | string | ❌       |
| `email`    | string | ❌       |

---

## 5. Module: Franchise Store

**Base URL**: `/stores`

### 5.1 Tạo cửa hàng

- **Endpoint**: `POST /stores`
- **Roles**: `MANAGER`
- **Request Body** (`CreateStoreDto`):

| Field         | Type   | Bắt buộc |
| ------------- | ------ | -------- |
| `name`        | string | ✅       |
| `address`     | string | ✅       |
| `phone`       | string | ❌       |
| `managerName` | string | ❌       |

### 5.2 Danh sách cửa hàng

- **Endpoint**: `GET /stores`
- **Roles**: `MANAGER`, `SUPPLY_COORDINATOR`
- **Query** (`GetStoresFilterDto` extends `PaginationParamsDto`):

| Query      | Type    | Mô tả          |
| ---------- | ------- | -------------- |
| `search`   | string  | Tìm theo tên   |
| `isActive` | boolean | Lọc trạng thái |

### 5.3 Chi tiết cửa hàng

- **Endpoint**: `GET /stores/:id`
- **Roles**: `MANAGER`

### 5.4 Cập nhật cửa hàng

- **Endpoint**: `PATCH /stores/:id`
- **Roles**: `MANAGER`
- **Request Body** (`UpdateStoreDto`): Giống `CreateStoreDto` + `isActive?: boolean`

### 5.5 Xóa cửa hàng

- **Endpoint**: `DELETE /stores/:id`
- **Roles**: `MANAGER`

### 5.6 Analytics: Độ tin cậy cửa hàng

- **Endpoint**: `GET /stores/analytics/reliability`
- **Roles**: `MANAGER`

### 5.7 Analytics: Xu hướng đặt hàng

- **Endpoint**: `GET /stores/analytics/demand-pattern`
- **Roles**: `MANAGER`
- **Query** (`DemandPatternQueryDto`): `productId?: number`

---

## 6. Module: Supplier

**Base URL**: `/suppliers`

### 6.1 Tạo nhà cung cấp

- **Endpoint**: `POST /suppliers`
- **Roles**: `MANAGER`
- **Request Body** (`CreateSupplierDto`):

| Field         | Type    | Bắt buộc | Mô tả         |
| ------------- | ------- | -------- | ------------- |
| `name`        | string  | ✅       | Tên NCC       |
| `contactName` | string  | ❌       | Người liên hệ |
| `phone`       | string  | ❌       | SĐT 10 số VN  |
| `address`     | string  | ❌       | Địa chỉ       |
| `isActive`    | boolean | ❌       | Default: true |

### 6.2 Danh sách nhà cung cấp

- **Endpoint**: `GET /suppliers`
- **Roles**: Tất cả (cần login)
- **Query** (`GetSuppliersDto` extends `PaginationParamsDto`):

| Query      | Type    | Mô tả                    |
| ---------- | ------- | ------------------------ |
| `search`   | string  | Tìm theo tên/SĐT/liên hệ |
| `isActive` | boolean | Lọc trạng thái           |

### 6.3 Chi tiết / Cập nhật / Xóa nhà cung cấp

- `GET /suppliers/:id` – Tất cả (cần login)
- `PATCH /suppliers/:id` – `MANAGER`
- `DELETE /suppliers/:id` – `MANAGER`

---

## 7. Module: Product & Batch

**Base URL**: `/products`

### 7.1 Tạo sản phẩm

- **Endpoint**: `POST /products`
- **Roles**: `MANAGER`
- **Request Body** (`CreateProductDto`):

| Field           | Type         | Bắt buộc | Mô tả              |
| --------------- | ------------ | -------- | ------------------ |
| `name`          | string       | ✅       | Tên sản phẩm       |
| `baseUnitId`    | number       | ✅       | ID đơn vị tính     |
| `shelfLifeDays` | number       | ✅       | Hạn sử dụng (ngày) |
| `imageUrl`      | string (URL) | ✅       | Ảnh sản phẩm       |

### 7.2 Danh sách sản phẩm

- **Endpoint**: `GET /products`
- **Roles**: `MANAGER`
- **Query** (`GetProductsDto` extends `PaginationParamsDto`):

| Query      | Type    | Mô tả            |
| ---------- | ------- | ---------------- |
| `search`   | string  | Tìm theo tên/SKU |
| `isActive` | boolean | Lọc trạng thái   |

### 7.3 Chi tiết / Cập nhật / Xóa / Khôi phục sản phẩm

- `GET /products/:id` – `MANAGER`
- `PATCH /products/:id` – `MANAGER` (Body: `UpdateProductDto` – PartialType of CreateProductDto)
- `DELETE /products/:id` – `MANAGER` (Soft delete)
- `PATCH /products/:id/restore` – `MANAGER`

### 7.4 Danh sách lô hàng (Batches)

- **Endpoint**: `GET /products/batches`
- **Roles**: `MANAGER`, `CENTRAL_KITCHEN_STAFF`
- **Query** (`GetBatchesDto` extends `PaginationParamsDto`):

| Query        | Type                | Mô tả             |
| ------------ | ------------------- | ----------------- |
| `productId`  | number              | Lọc theo sản phẩm |
| `supplierId` | number              | Lọc theo NCC      |
| `fromDate`   | string (YYYY-MM-DD) | Ngày hết hạn từ   |
| `toDate`     | string (YYYY-MM-DD) | Ngày hết hạn đến  |

### 7.5 Chi tiết / Cập nhật lô hàng

- `GET /products/batches/:id` – `MANAGER`, `CENTRAL_KITCHEN_STAFF`
- `PATCH /products/batches/:id` – `MANAGER`, `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`UpdateBatchDto`):

| Field             | Type         | Mô tả          |
| ----------------- | ------------ | -------------- |
| `initialQuantity` | number       | Sửa SL ban đầu |
| `imageUrl`        | string (URL) | Ảnh minh chứng |
| `status`          | BatchStatus  | Trạng thái lô  |

---

## 8. Module: Inbound Logistics

**Base URL**: `/inbound`

### 8.1 Tạo phiếu nhập

- **Endpoint**: `POST /inbound/receipts`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`CreateReceiptDto`):

| Field        | Type   | Bắt buộc |
| ------------ | ------ | -------- |
| `supplierId` | number | ✅       |
| `note`       | string | ❌       |

- **Response**: Record phiếu nhập vừa tạo (status = `draft`)

### 8.2 Danh sách phiếu nhập

- **Endpoint**: `GET /inbound/receipts`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Query** (`GetReceiptsDto` extends `PaginationParamsDto`):

| Query        | Type          | Mô tả             |
| ------------ | ------------- | ----------------- |
| `status`     | ReceiptStatus | Lọc trạng thái    |
| `supplierId` | number        | Lọc theo NCC      |
| `search`     | string        | Tìm theo ID phiếu |
| `fromDate`   | string        | Từ ngày           |
| `toDate`     | string        | Đến ngày          |

### 8.3 Chi tiết phiếu nhập

- **Endpoint**: `GET /inbound/receipts/:id`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Lấy thông tin phiếu nhập thành công",
  "data": {
    "id": "uuid",
    "status": "draft",
    "note": "Nhập hàng tươi sống",
    "createdAt": "2026-02-25T00:00:00.000Z",
    "supplier": {
      "id": 1,
      "name": "Công ty ABC",
      "contactName": "Nguyen Van A",
      "phone": "0901234567"
    },
    "createdBy": {
      "id": "uuid",
      "username": "Kitchen Staff 01"
    },
    "items": [
      {
        "id": 1,
        "quantity": "50",
        "batch": {
          "id": 10,
          "batchCode": "GA-20260225-001",
          "expiryDate": "2026-02-28",
          "status": "pending",
          "product": {
            "id": 1,
            "name": "Gà rán KFC Original",
            "sku": "GR-001",
            "unit": "kg"
          }
        }
      }
    ]
  }
}
```

### 8.4 Thêm hàng vào phiếu nhập

- **Endpoint**: `POST /inbound/receipts/:id/items`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`AddReceiptItemDto`):

| Field       | Type   | Bắt buộc     |
| ----------- | ------ | ------------ |
| `productId` | number | ✅           |
| `quantity`  | number | ✅ (min 0.1) |

- **Response**:

```json
{
  "statusCode": 201,
  "message": "Thêm hàng vào biên lai thành công",
  "data": {
    "batchId": 10,
    "batchCode": "GA-20260225-001",
    "manufactureDate": "2026-02-25T00:00:00.000Z",
    "expiryDate": "2026-02-28T00:00:00.000Z",
    "warning": "Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)"
  }
}
```

### 8.5 Chốt phiếu nhập (Nhập kho chính thức)

- **Endpoint**: `PATCH /inbound/receipts/:id/complete`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **⚠️ Nghiệp vụ**: Chỉ sau API này, SL hàng mới được cộng vào tồn kho. Batch chuyển sang `available`.

### 8.6 Xóa lô hàng khỏi phiếu (chỉ khi Draft)

- **Endpoint**: `DELETE /inbound/items/:batchId`
- **Roles**: `CENTRAL_KITCHEN_STAFF`

### 8.7 Lấy data in tem QR

- **Endpoint**: `GET /inbound/batches/:id/label`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Lấy data in QRCode thành công",
  "data": {
    "qrData": "encoded-string",
    "readableData": {
      "batchCode": "GA-20260225-001",
      "sku": "GR-001",
      "expiryDate": "2026-02-28"
    }
  }
}
```

### 8.8 In lại tem

- **Endpoint**: `POST /inbound/batches/reprint`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`ReprintBatchDto`): `{ "batchId": 10 }`

---

## 9. Module: Inventory

**Base URL**: `/inventory`

### 9.1 Tồn kho cửa hàng (Store Staff)

- **Endpoint**: `GET /inventory/store`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Query** (`GetStoreInventoryDto` extends `PaginationParamsDto`): `search?: string`
- **Response** (`InventoryDto[]`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "inventoryId": 1,
      "batchId": 10,
      "productId": 1,
      "productName": "Gà rán KFC Original",
      "sku": "GR-001",
      "batchCode": "GA-20260225-001",
      "quantity": 50,
      "expiryDate": "2026-02-28T00:00:00.000Z",
      "unit": "kg",
      "imageUrl": "https://cdn.example.com/image.jpg"
    }
  ]
}
```

### 9.2 Lịch sử kho Store

- **Endpoint**: `GET /inventory/store/transactions`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Query** (`GetInventoryTransactionsDto` extends `PaginationParamsDto`):

| Query      | Type            | Mô tả              |
| ---------- | --------------- | ------------------ |
| `type`     | TransactionType | Lọc loại giao dịch |
| `fromDate` | string          | Từ ngày            |
| `toDate`   | string          | Đến ngày           |

### 9.3 Tổng hợp tồn kho (Manager)

- **Endpoint**: `GET /inventory/summary`
- **Roles**: `MANAGER`, `ADMIN`
- **Query** (`GetInventorySummaryDto` extends `PaginationParamsDto`):

| Query         | Type   | Mô tả            |
| ------------- | ------ | ---------------- |
| `warehouseId` | number | Lọc theo kho     |
| `searchTerm`  | string | Tìm theo tên/SKU |

### 9.4 Cảnh báo tồn kho thấp

- **Endpoint**: `GET /inventory/low-stock`
- **Roles**: `MANAGER`, `ADMIN`
- **Query**: `warehouseId?: number`
- **Response** (`LowStockItemDto[]`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "productId": 1,
      "productName": "Gà rán KFC Original",
      "sku": "GR-001",
      "minStockLevel": 100,
      "currentQuantity": 25,
      "unit": "kg"
    }
  ]
}
```

### 9.5 Điều chỉnh tồn kho

- **Endpoint**: `POST /inventory/adjust`
- **Roles**: `MANAGER`, `ADMIN`
- **Request Body** (`InventoryAdjustmentDto`):

| Field                | Type   | Bắt buộc |
| -------------------- | ------ | -------- |
| `warehouseId`        | number | ✅       |
| `batchId`            | number | ✅       |
| `adjustmentQuantity` | number | ✅       |
| `reason`             | string | ✅       |
| `note`               | string | ❌       |

### 9.6 Tồn kho Bếp (Group by Product)

- **Endpoint**: `GET /inventory/kitchen/summary`
- **Roles**: `MANAGER`, `CENTRAL_KITCHEN_STAFF`, `ADMIN`
- **Query** (`GetKitchenInventoryDto` extends `PaginationParamsDto`): `search?: string`

### 9.7 Chi tiết lô hàng theo sản phẩm (Drill-down)

- **Endpoint**: `GET /inventory/kitchen/details`
- **Roles**: `MANAGER`, `CENTRAL_KITCHEN_STAFF`, `ADMIN`
- **Query**: `product_id: number`

### 9.8–9.11 Analytics Dashboard

| Endpoint                                     | Method | Roles          | Query DTO                                        |
| -------------------------------------------- | ------ | -------------- | ------------------------------------------------ |
| `/inventory/analytics/summary`               | GET    | MANAGER, ADMIN | –                                                |
| `/inventory/analytics/aging`                 | GET    | MANAGER, ADMIN | `AgingReportQueryDto` (`daysThreshold?: number`) |
| `/inventory/analytics/waste`                 | GET    | MANAGER, ADMIN | `WasteReportQueryDto` (`fromDate?, toDate?`)     |
| `/inventory/analytics/financial/loss-impact` | GET    | MANAGER, ADMIN | `FinancialLossQueryDto` (`from?, to?`)           |

---

## 10. Module: Order

**Base URL**: `/orders`

### 10.1 Danh sách đơn hàng

- **Endpoint**: `GET /orders`
- **Roles**: `MANAGER`, `SUPPLY_COORDINATOR`, `ADMIN`
- **Query** (`GetOrdersDto` extends `PaginationParamsDto`):

| Query      | Type          | Mô tả                 |
| ---------- | ------------- | --------------------- |
| `status`   | OrderStatus   | Lọc trạng thái        |
| `search`   | string        | Tìm theo mã đơn       |
| `storeId`  | string (UUID) | Lọc theo cửa hàng     |
| `fromDate` | string        | Từ ngày (YYYY-MM-DD)  |
| `toDate`   | string        | Đến ngày (YYYY-MM-DD) |

### 10.2 Tạo đơn hàng

- **Endpoint**: `POST /orders`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Request Body** (`CreateOrderDto`):

| Field          | Type             | Bắt buộc | Mô tả                                                            |
| -------------- | ---------------- | -------- | ---------------------------------------------------------------- |
| `deliveryDate` | string (ISO)     | ✅       | Phải ≥ ngày mai. Nếu đặt sau 22:00, không cho phép giao ngày mai |
| `items`        | `OrderItemDto[]` | ✅       | Mỗi item: `productId` (int >0), `quantity` (int >0)              |

- **Response**:

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "uuid",
    "storeId": "uuid",
    "status": "pending",
    "deliveryDate": "2026-03-05T00:00:00.000Z",
    "createdAt": "2026-02-25T00:00:00.000Z"
  }
}
```

- **⚠️ Nghiệp vụ**: `ORDER_CLOSING_TIME` – Nếu hệ thống cấu hình giờ đóng đơn (ví dụ 16:00), đơn đặt sau giờ đó sẽ bị chặn.

### 10.3 Danh mục sản phẩm (Catalog – Blind Ordering)

- **Endpoint**: `GET /orders/catalog`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Query** (`GetCatalogDto` extends `PaginationParamsDto`): `search?: string`
- **Response** (`ProductCatalogDto[]`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [
    { "id": 1, "name": "Gà rán KFC Original", "sku": "GR-001", "unit": "kg" }
  ]
}
```

> **⚠️ Blind Ordering**: Store Staff chỉ thấy danh sách sản phẩm, KHÔNG thấy số lượng tồn kho.

### 10.4 Đơn hàng cửa hàng hiện tại

- **Endpoint**: `GET /orders/my-store`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Query**: `GetOrdersDto` (storeId tự động gán từ user)

### 10.5 Hủy đơn hàng

- **Endpoint**: `PATCH /orders/franchise/:id/cancel`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { "orderId": "uuid", "status": "cancelled" }
}
```

> Chỉ hủy được đơn ở trạng thái `pending`. Kiểm tra data isolation (chỉ hủy đơn của store mình).

### 10.6 Xem chi tiết đơn hàng

- **Endpoint**: `GET /orders/:id`
- **Roles**: `SUPPLY_COORDINATOR`, `FRANCHISE_STORE_STAFF`, `MANAGER`, `ADMIN`

### 10.7 Xem đơn & So sánh kho (Coordinator Review)

- **Endpoint**: `GET /orders/coordinator/:id/review`
- **Roles**: `SUPPLY_COORDINATOR`, `ADMIN`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "orderId": "uuid",
    "storeName": "KFC Nguyen Thai Hoc",
    "status": "pending",
    "items": [
      {
        "productId": 1,
        "productName": "Gà rán KFC Original",
        "requestedQty": 100,
        "currentStock": 80,
        "canFulfill": false
      }
    ]
  }
}
```

### 10.8 Duyệt đơn hàng (Partial Fulfillment)

- **Endpoint**: `PATCH /orders/coordinator/:id/approve`
- **Roles**: `SUPPLY_COORDINATOR`, `ADMIN`
- **Request Body** (`ApproveOrderDto`):

| Field           | Type    | Mô tả                                 |
| --------------- | ------- | ------------------------------------- |
| `force_approve` | boolean | Xác nhận duyệt dù tỷ lệ đáp ứng < 20% |

- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "orderId": "uuid",
    "status": "approved",
    "results": [
      { "productId": 1, "requested": 100, "approved": 80, "missing": 20 }
    ]
  }
}
```

> **⚠️ No Backorder**: Nếu kho thiếu, `approved < requested`. Phần thiếu bị hủy, KHÔNG tạo đơn nợ.
> **⚠️ Zero Fulfillment**: Nếu tất cả hàng hết, đơn tự động chuyển sang `rejected`.
> **⚠️ Fill Rate < 20%**: Trả về lỗi 400, yêu cầu FE gửi lại với `force_approve: true` nếu muốn tiếp tục.

### 10.9 Từ chối đơn hàng

- **Endpoint**: `PATCH /orders/coordinator/:id/reject`
- **Roles**: `SUPPLY_COORDINATOR`, `ADMIN`
- **Request Body** (`RejectOrderDto`): `{ "reason": "Out of stock" }`

### 10.10 Analytics: Fulfillment Rate

- **Endpoint**: `GET /orders/analytics/fulfillment-rate`
- **Roles**: `MANAGER`, `ADMIN`
- **Query** (`FulfillmentRateQueryDto`): `storeId?, from?, to?`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "kpi": {
      "fillRatePercentage": 85.5,
      "totalRequestedQty": 1000,
      "totalApprovedQty": 855
    },
    "shortfallAnalysis": [{ "reason": "Hết hàng", "shortfallQuantity": 145 }]
  }
}
```

### 10.11 Analytics: SLA Lead-time

- **Endpoint**: `GET /orders/analytics/performance/lead-time`
- **Roles**: `MANAGER`, `ADMIN`
- **Query** (`SlaQueryDto`): `from?, to?`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "kpi": {
      "avgReviewTimeHours": 2.5,
      "avgPickingTimeHours": 1.8,
      "avgDeliveryTimeHours": 5.2
    },
    "totalOrdersAnalyzed": 120
  }
}
```

---

## 11. Module: Warehouse Operation

**Base URL**: `/warehouse`

### 11.1 Danh sách tác vụ soạn hàng

- **Endpoint**: `GET /warehouse/picking-tasks`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Query** (`GetPickingTasksDto` extends `PaginationParamsDto`):

| Query    | Type                | Mô tả                        |
| -------- | ------------------- | ---------------------------- |
| `date`   | string (YYYY-MM-DD) | Ngày giao hàng               |
| `search` | string              | Tìm theo mã đơn/tên cửa hàng |

### 11.2 Chi tiết soạn hàng (Picking List – FEFO)

- **Endpoint**: `GET /warehouse/picking-tasks/:id`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Lấy chi tiết danh sách soạn hàng thành công",
  "data": {
    "orderId": "uuid",
    "shipmentId": "uuid",
    "items": [
      {
        "productId": 1,
        "productName": "Gà rán KFC Original",
        "requiredQty": 100,
        "suggestedBatches": [
          {
            "batchCode": "GA-20260220-001",
            "qtyToPick": 60,
            "expiry": "2026-02-27"
          },
          {
            "batchCode": "GA-20260222-002",
            "qtyToPick": 40,
            "expiry": "2026-03-01"
          }
        ]
      }
    ]
  }
}
```

> **⚠️ FEFO**: `suggestedBatches` được sắp xếp theo `expiry ASC` – lô hết hạn sớm nhất lên đầu.

### 11.3 Reset soạn hàng

- **Endpoint**: `PATCH /warehouse/picking-tasks/:orderId/reset`
- **Roles**: `CENTRAL_KITCHEN_STAFF`

### 11.4 Duyệt & Xuất kho hàng loạt (Finalize Bulk)

- **Endpoint**: `PATCH /warehouse/shipments/finalize-bulk`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`FinalizeBulkShipmentDto`):

```json
{
  "orders": [
    {
      "orderId": "uuid",
      "pickedItems": [
        { "batchId": 42, "quantity": 50.5 },
        { "batchId": 43, "quantity": 30 }
      ]
    }
  ]
}
```

> **⚠️ FEFO_STRICT_MODE**: Nếu bật, hệ thống sẽ chặn xuất lô mới nếu còn lô cũ chưa hết. Tối đa 10 đơn/lần.

### 11.5 In phiếu giao hàng

- **Endpoint**: `GET /warehouse/shipments/:id/label`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Lấy dữ liệu in phiếu giao hàng thành công",
  "data": {
    "templateType": "INVOICE_A4",
    "shipmentId": "uuid",
    "date": "2026-02-25T08:00:00.000Z",
    "storeName": "KFC Nguyen Thai Hoc",
    "items": [
      {
        "productName": "Gà rán KFC",
        "batchCode": "GA-001",
        "qty": "50",
        "expiry": "2026-02-28"
      }
    ]
  }
}
```

### 11.6 Quét mã lô (Scan Check)

- **Endpoint**: `GET /warehouse/scan-check`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Query** (`ScanCheckDto`): `batchCode: string` (bắt buộc)
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Kiểm tra thông tin lô hàng thành công",
  "data": {
    "productName": "Gà rán KFC Original",
    "batchId": 42,
    "batchCode": "GA-20260225-001",
    "expiryDate": "2026-02-28",
    "quantityPhysical": 100,
    "status": "AVAILABLE"
  }
}
```

### 11.7 Báo cáo sự cố lô hàng

- **Endpoint**: `POST /warehouse/batch/report-issue`
- **Roles**: `CENTRAL_KITCHEN_STAFF`
- **Request Body** (`ReportIssueDto`):

| Field     | Type   | Bắt buộc |
| --------- | ------ | -------- |
| `batchId` | number | ✅       |
| `reason`  | string | ✅       |

---

## 12. Module: Shipment

**Base URL**: `/shipments`

### 12.1 Danh sách lô hàng vận chuyển

- **Endpoint**: `GET /shipments`
- **Roles**: `MANAGER`, `SUPPLY_COORDINATOR`, `ADMIN`
- **Query** (`GetShipmentsDto` extends `PaginationParamsDto`):

| Query      | Type           | Mô tả                      |
| ---------- | -------------- | -------------------------- |
| `status`   | ShipmentStatus | Lọc trạng thái             |
| `storeId`  | string         | ID cửa hàng                |
| `search`   | string         | Tìm theo mã shipment/order |
| `fromDate` | string         | Từ ngày                    |
| `toDate`   | string         | Đến ngày                   |

### 12.2 Lô hàng cửa hàng hiện tại

- **Endpoint**: `GET /shipments/store/my`
- **Roles**: `FRANCHISE_STORE_STAFF`

### 12.3 Picking List (theo Shipment)

- **Endpoint**: `GET /shipments/:id/picking-list`
- **Roles**: `SUPPLY_COORDINATOR`, `CENTRAL_KITCHEN_STAFF`, `ADMIN`

### 12.4 Chi tiết lô vận chuyển

- **Endpoint**: `GET /shipments/:id`
- **Roles**: Tất cả (kiểm tra ownership)
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Lấy chi tiết đơn hàng vận chuyển thành công",
  "data": {
    "id": "uuid",
    "orderId": "uuid",
    "status": "in_transit",
    "createdAt": "2026-02-25T00:00:00.000Z",
    "order": {
      "id": "uuid",
      "storeId": "uuid",
      "storeName": "KFC Nguyen Thai Hoc"
    },
    "items": [
      {
        "batchId": 42,
        "batchCode": "GA-20260225-001",
        "productId": 1,
        "productName": "Gà rán KFC Original",
        "sku": "GR-001",
        "quantity": 50,
        "expiryDate": "2026-02-28",
        "imageUrl": "https://cdn.example.com/image.jpg"
      }
    ]
  }
}
```

### 12.5 Nhận hàng nhanh (Receive All)

- **Endpoint**: `PATCH /shipments/:id/receive-all`
- **Roles**: `FRANCHISE_STORE_STAFF`
- **Body**: Không cần gửi gì
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Nhận hàng nhanh thành công",
  "data": {
    "message": "Xác nhận nhận hàng thành công.",
    "shipmentId": "uuid",
    "status": "completed",
    "hasDiscrepancy": false,
    "claimId": null
  }
}
```

### 12.6 Nhận hàng chi tiết (Báo cáo thiếu/hỏng)

- **Endpoint**: `POST /shipments/:id/receive`
- **Roles**: `FRANCHISE_STORE_STAFF`
- **Request Body** (`ReceiveShipmentDto`):

```json
{
  "items": [
    {
      "batchId": 42,
      "actualQty": 45,
      "damagedQty": 3,
      "evidenceUrls": ["https://cdn.example.com/evidence/001.jpg"]
    }
  ],
  "notes": "Có vài hộp bị móp"
}
```

| Field (ReceiveItemDto) | Type     | Bắt buộc | Mô tả             |
| ---------------------- | -------- | -------- | ----------------- |
| `batchId`              | number   | ✅       | ID lô hàng        |
| `actualQty`            | number   | ✅       | SL thực nhận (≥0) |
| `damagedQty`           | number   | ✅       | SL hỏng (≥0)      |
| `evidenceUrls`         | string[] | ❌       | Ảnh bằng chứng    |

- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "message": "Xác nhận nhận hàng thành công.",
    "shipmentId": "uuid",
    "status": "completed",
    "hasDiscrepancy": true,
    "claimId": "uuid-claim"
  }
}
```

> **⚠️ Discrepancy Handling**: Nếu `actualQty < shippedQty` hoặc `damagedQty > 0`, hệ thống **tự động tạo Claim** và chỉ cộng kho số hàng tốt (`actualQty - damagedQty`).

---

## 13. Module: Claim

**Base URL**: `/claims`

### 13.1 Tạo khiếu nại thủ công

- **Endpoint**: `POST /claims`
- **Roles**: `FRANCHISE_STORE_STAFF`, `ADMIN`
- **Request Body** (`CreateManualClaimDto`):

```json
{
  "shipmentId": "uuid",
  "description": "Mô tả sự cố",
  "items": [
    {
      "productId": 1,
      "batchId": 42,
      "quantityMissing": 5,
      "quantityDamaged": 2,
      "reason": "Hỏng do va chạm",
      "imageProofUrl": "https://cdn.example.com/proof.jpg"
    }
  ]
}
```

> **⚠️ Business Rules**:
>
> - Chỉ tạo claim cho shipment đã `completed`
> - Phải thuộc store của mình (ownership check)
> - Cửa sổ 24 giờ kể từ khi shipment hoàn thành
> - Nếu `quantityDamaged > 0`, bắt buộc có `imageProofUrl` + `reason`
> - Tồn kho giảm ngay lập tức (transactional)

### 13.2 Danh sách khiếu nại

- **Endpoint**: `GET /claims`
- **Roles**: `MANAGER`, `SUPPLY_COORDINATOR`, `ADMIN`, `FRANCHISE_STORE_STAFF`
- **Query** (`GetClaimsDto` extends `PaginationParamsDto`):

| Query      | Type          | Mô tả                      |
| ---------- | ------------- | -------------------------- |
| `status`   | ClaimStatus   | Lọc trạng thái             |
| `search`   | string        | Tìm theo mã claim/shipment |
| `storeId`  | string (UUID) | Lọc theo cửa hàng          |
| `fromDate` | string        | Từ ngày                    |
| `toDate`   | string        | Đến ngày                   |

> 📌 **Ghi chú nghiệp vụ (Business Rule)**: Nếu role là `FRANCHISE_STORE_STAFF`, hệ thống tự động filter chỉ trả về các claims thuộc `storeId` của user đó. Các roles quản lý cấp cao (`MANAGER`, `SUPPLY_COORDINATOR`, `ADMIN`) sẽ xem được toàn bộ khiếu nại của tất cả các cửa hàng.

### 13.3 Khiếu nại cửa hàng hiện tại

- **Endpoint**: `GET /claims/my-store`
- **Roles**: `FRANCHISE_STORE_STAFF`

### 13.4 Chi tiết khiếu nại

- **Endpoint**: `GET /claims/:id`
- **Roles**: `FRANCHISE_STORE_STAFF`, `SUPPLY_COORDINATOR`, `MANAGER`, `ADMIN`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": "uuid",
    "shipmentId": "uuid",
    "status": "pending",
    "createdAt": "2026-02-25T00:00:00.000Z",
    "resolvedAt": null,
    "items": [
      {
        "productName": "Gà rán KFC Original",
        "sku": "GR-001",
        "quantityMissing": 5,
        "quantityDamaged": 2,
        "reason": "Hỏng do va chạm",
        "imageUrl": "https://cdn.example.com/proof.jpg"
      }
    ]
  }
}
```

> 📌 **Ghi chú quyền truy cập (Access Rule)**: Role `FRANCHISE_STORE_STAFF` chỉ được phép xem chi tiết khiếu nại do cửa hàng mình tạo (trả về 403 Forbidden nếu xem của store khác). Các role `MANAGER`, `SUPPLY_COORDINATOR`, `ADMIN` được phép xem chi tiết bất kỳ khiếu nại nào trong hệ thống.

### 13.5 Xử lý khiếu nại

- **Endpoint**: `PATCH /claims/:id/resolve`
- **Roles**: `SUPPLY_COORDINATOR`, `MANAGER`, `ADMIN`
- **Request Body** (`ResolveClaimDto`):

| Field            | Type                     | Bắt buộc | Mô tả         |
| ---------------- | ------------------------ | -------- | ------------- |
| `status`         | `approved` \| `rejected` | ✅       | Kết quả xử lý |
| `resolutionNote` | string                   | ❌       | Ghi chú       |

### 13.6 Analytics: Tổng quan sai lệch

- **Endpoint**: `GET /claims/analytics/summary`
- **Roles**: `MANAGER`, `ADMIN`
- **Query** (`ClaimSummaryQueryDto`): `productId?: number`
- **Response**:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "kpi": {
      "damageRatePercentage": 4.25,
      "missingRatePercentage": 2.1,
      "totalShipments": 200,
      "shipmentsWithMissing": 8
    },
    "bottleneckProducts": [
      {
        "productId": 1,
        "productName": "Gà rán KFC Original",
        "totalShipped": 500,
        "totalDamaged": 25,
        "totalMissing": 10,
        "damageRate": "5%"
      }
    ]
  }
}
```

---

## 14. Module: System Config

**Base URL**: `/system-configs`

### 14.1 Lấy danh sách cấu hình

- **Endpoint**: `GET /system-configs`
- **Roles**: `ADMIN`

### 14.2 Cập nhật cấu hình

- **Endpoint**: `PATCH /system-configs/:key`
- **Roles**: `ADMIN`
- **Request Body** (`UpdateSystemConfigDto`):

| Field         | Type   | Bắt buộc |
| ------------- | ------ | -------- |
| `value`       | string | ✅       |
| `description` | string | ❌       |

**Các key quan trọng**:

| Key                  | Ví dụ     | Mô tả                          |
| -------------------- | --------- | ------------------------------ |
| `ORDER_CLOSING_TIME` | `"16:00"` | Giờ đóng đơn hàng (Vietnam TZ) |
| `FEFO_STRICT_MODE`   | `"TRUE"`  | Bật chế độ nghiêm ngặt FEFO    |

---

## 15. Module: Upload (Cloudinary)

**Base URL**: `/upload`

### 15.1 Upload ảnh

- **Endpoint**: `POST /upload/image`
- **Roles**: Public (không cần auth)
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (png, jpeg, jpg, webp – max 5MB)
- **Response**:

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "url": "https://res.cloudinary.com/.../image.jpg",
    "publicId": "folder/image-id"
  }
}
```

---

## 16. Hướng dẫn luồng nghiệp vụ

### 🔄 Luồng 1: Đặt hàng → Nhận hàng (Happy Path)

```
[Store Staff]                    [Coordinator]                 [Kitchen Staff]
    |                                |                              |
    |-- GET /orders/catalog -------->|                              |
    |-- POST /orders --------------->|                              |
    |                                |                              |
    |                  GET /orders/coordinator/:id/review           |
    |                  PATCH /orders/coordinator/:id/approve ------>|
    |                  (Hệ thống tự tạo Shipment)                  |
    |                                |                              |
    |                                |    GET /warehouse/picking-tasks
    |                                |    GET /warehouse/picking-tasks/:id
    |                                |    PATCH /warehouse/shipments/finalize-bulk
    |                                |    (Trừ kho + Shipment → in_transit)
    |                                |                              |
    |<-- GET /shipments/store/my ----|                              |
    |<-- PATCH /shipments/:id/receive-all (nếu đủ hàng)            |
    |          hoặc                  |                              |
    |<-- POST /shipments/:id/receive (nếu có sai lệch)             |
    |    (Hệ thống tự tạo Claim nếu thiếu/hỏng)                   |
```

### ⚠️ Luồng 2: Partial Fulfillment (Kho thiếu hàng)

1. Store đặt đơn 100 kg gà
2. Coordinator review → kho chỉ còn 80 kg
3. Coordinator approve → `quantityApproved = 80`, `missing = 20`
4. **Không tạo backorder** – phần thiếu bị hủy
5. Store muốn thêm thì phải đặt đơn mới ở kỳ sau

### 📋 Luồng 3: Nhận hàng & Xử lý sai lệch (Discrepancy)

1. Store nhận hàng qua `POST /shipments/:id/receive`:
   - Gửi `actualQty` < `shippedQty` → **Thiếu hàng**
   - Gửi `damagedQty` > 0 → **Hàng hỏng** (cần `evidenceUrls`)
2. Hệ thống tự động:
   - Cộng kho store = `actualQty - damagedQty` (số hàng tốt)
   - Tạo **Claim** tự động cho phần thiếu/hỏng
   - Cập nhật Order status → `claimed`
3. Coordinator xử lý claim qua `PATCH /claims/:id/resolve`

### 📋 Luồng 4: Khiếu nại thủ công (Manual Claim)

1. Store nhận hàng bình thường (receive-all)
2. Sau đó phát hiện có hàng hỏng trong vòng **24 giờ**
3. Gọi `POST /claims` với chi tiết sản phẩm hỏng
4. Hệ thống **giảm tồn kho ngay lập tức** (transactional)
5. Order status → `claimed`

### 📦 Luồng 5: Nhập kho (Inbound)

```
[Kitchen Staff]
    |-- POST /inbound/receipts (Tạo phiếu Draft)
    |-- POST /inbound/receipts/:id/items (Thêm hàng → tự sinh Batch)
    |-- GET /inbound/batches/:id/label (In tem QR)
    |-- PATCH /inbound/receipts/:id/complete (Chốt → Cộng kho)
```

---

> **Tài liệu này được tạo bằng cách đối chiếu trực tiếp với source code (Controllers, DTOs, Services, Schema).**
> Cập nhật lần cuối: 2026-02-25
