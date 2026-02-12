# 📘 FRONTEND API INTEGRATION GUIDE

> **Dự án:** Central Kitchen & Franchise Store Management System (KFC Model)
> **Backend Stack:** NestJS + Drizzle ORM + PostgreSQL
> **Phiên bản tài liệu:** 1.0 | Ngày cập nhật: 2026-02-12

---

## Mục Lục

1. [Overview & Setup](#1-overview--setup)
2. [Common Enums & Constants](#2-common-enums--constants)
3. [Cấu Trúc Response Chuẩn](#3-cấu-trúc-response-chuẩn)
4. [Module: Authentication](#4-module-authentication)
5. [Module: Franchise Store](#5-module-franchise-store)
6. [Module: Product & Batch](#6-module-product--batch)
7. [Module: Supplier](#7-module-supplier)
8. [Module: Inbound Logistics (Nhập kho)](#8-module-inbound-logistics-nhập-kho)
9. [Module: Inventory (Tồn kho)](#9-module-inventory-tồn-kho)
10. [Module: Order (Đặt hàng)](#10-module-order-đặt-hàng)
11. [Module: Warehouse Operation (Vận hành kho)](#11-module-warehouse-operation-vận-hành-kho)
12. [Module: Shipment (Vận chuyển)](#12-module-shipment-vận-chuyển)
13. [Module: Claim (Khiếu nại)](#13-module-claim-khiếu-nại)
14. [Special Notes for Frontend](#14-special-notes-for-frontend)
15. [Business Flow Diagrams](#15-business-flow-diagrams)

---

## 1. Overview & Setup

### 1.1. Base URL

```
{DOMAIN}/wdp301-api/v1
```

- **Global Prefix:** `wdp301-api`
- **API Versioning:** URI-based, mặc định `v1`. Ví dụ: `http://localhost:8080/wdp301-api/v1/auth/login`
- **Swagger UI:** `{DOMAIN}/wdp301-api/docs`

### 1.2. Timezone

- Backend sử dụng **UTC** cho tất cả các trường `timestamp` (`createdAt`, `updatedAt`, `deliveryDate`...).
- Trường `date` (ví dụ: `expiryDate` của Batch) lưu dạng `YYYY-MM-DD` (không có timezone).
- **Frontend cần tự convert sang múi giờ local (UTC+7)** khi hiển thị.

### 1.3. Authentication Flow

#### Bước 1: Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@gmail.com",
  "password": "pass123456789"
}
```

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "userId": "uuid-...",
    "email": "admin@gmail.com",
    "username": "Admin User",
    "role": "admin",
    "storeId": null,
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  },
  "timestamp": "2026-02-12T13:00:00.000Z",
  "path": "/wdp301-api/v1/auth/login"
}
```

> **Quan trọng:** Lưu cả `accessToken` và `refreshToken`. `storeId` sẽ là `null` nếu user không phải `franchise_store_staff`.

#### Bước 2: Đính kèm Token vào mỗi Request

```http
Authorization: Bearer {accessToken}
```

#### Bước 3: Refresh Token (khi Access Token hết hạn)

```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}
```

**Response:** Trả về cặp `accessToken` + `refreshToken` mới. **Refresh Token cũ sẽ bị hủy** (cơ chế Rotation).

- Refresh Token có **thời hạn 7 ngày**.
- Nếu Refresh Token hết hạn hoặc đã dùng → trả về `401 Unauthorized` → **Redirect về trang Login**.

#### Bước 4: Logout

```http
POST /auth/logout
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}
```

> Gửi `refreshToken` hiện tại để backend xóa khỏi DB, ngăn chặn tái sử dụng.

### 1.4. Rate Limiting

- Login, Refresh Token, Forgot Password: **5 lần / 60 giây**.
- Reset Password: **1 lần / 60 giây**.
- General: Cấu hình qua biến môi trường `THROTTLE_TTL` và `THROTTLE_LIMIT`.

---

## 2. Common Enums & Constants

### 2.1. UserRole (Vai trò người dùng)

| Giá trị                 | Ý nghĩa                 | Ghi chú                                                                  |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `admin`                 | Quản trị viên hệ thống  | Toàn quyền. Chỉ admin mới tạo được user.                                 |
| `manager`               | Quản lý                 | Quản lý Master Data (Product, Store, Supplier, Inventory).               |
| `supply_coordinator`    | Điều phối viên cung ứng | Duyệt/Từ chối đơn hàng, xử lý khiếu nại.                                 |
| `central_kitchen_staff` | Nhân viên Bếp Trung Tâm | Nhập kho, soạn hàng, xuất kho.                                           |
| `franchise_store_staff` | Nhân viên Cửa hàng      | Đặt hàng, nhận hàng, tạo khiếu nại. **Chỉ thấy dữ liệu của Store mình.** |

### 2.2. OrderStatus (Trạng thái đơn hàng)

| Giá trị      | Ý nghĩa        | Mô tả chi tiết                                                         |
| ------------ | -------------- | ---------------------------------------------------------------------- |
| `pending`    | Chờ duyệt      | Đơn vừa được Store tạo, chưa ai xử lý.                                 |
| `approved`   | Đã duyệt       | Coordinator đã duyệt, hệ thống đã **reserve kho** và **tạo Shipment**. |
| `rejected`   | Đã từ chối     | Coordinator từ chối hoặc hệ thống tự reject do hết kho hoàn toàn.      |
| `cancelled`  | Đã hủy         | Store tự hủy đơn (chỉ áp dụng khi đơn còn `pending`).                  |
| `picking`    | Đang soạn hàng | _(Dự phòng)_ Nhân viên kho đang nhặt hàng.                             |
| `delivering` | Đang giao      | Hàng đã xuất kho, xe đang trên đường giao.                             |
| `completed`  | Hoàn thành     | Store đã nhận hàng đầy đủ, không có khiếu nại.                         |
| `claimed`    | Có khiếu nại   | Store nhận hàng nhưng phát hiện thiếu/hỏng → Claim được tạo tự động.   |

### 2.3. ShipmentStatus (Trạng thái vận chuyển)

| Giá trị      | Ý nghĩa                                                    |
| ------------ | ---------------------------------------------------------- |
| `preparing`  | Đang chuẩn bị hàng (Phiếu shipment vừa tạo, chờ kho soạn). |
| `in_transit` | Đang vận chuyển (Kho đã xuất hàng, xe đang giao).          |
| `delivered`  | Đã giao đến _(Dự phòng)_.                                  |
| `completed`  | Hoàn thành (Store đã xác nhận nhận hàng).                  |

### 2.4. ClaimStatus (Trạng thái khiếu nại)

| Giá trị    | Ý nghĩa                                       |
| ---------- | --------------------------------------------- |
| `pending`  | Chờ xử lý.                                    |
| `approved` | Đã chấp nhận khiếu nại (bồi thường/đổi hàng). |
| `rejected` | Từ chối khiếu nại.                            |

### 2.5. ReceiptStatus (Trạng thái phiếu nhập kho)

| Giá trị     | Ý nghĩa                                                    |
| ----------- | ---------------------------------------------------------- |
| `draft`     | Nháp — đang khai báo hàng hóa, chưa chốt.                  |
| `completed` | Đã hoàn tất — hàng chính thức nhập kho, tồn kho được cộng. |
| `cancelled` | Đã hủy.                                                    |

### 2.6. BatchStatus (Trạng thái lô hàng)

| Giá trị     | Ý nghĩa                               |
| ----------- | ------------------------------------- |
| `pending`   | Lô vừa tạo, chưa chính thức nhập kho. |
| `available` | Đang khả dụng trong kho.              |
| `empty`     | Đã hết hàng.                          |
| `expired`   | Đã hết hạn.                           |

### 2.7. TransactionType (Loại giao dịch kho)

| Giá trị      | Ý nghĩa                                               |
| ------------ | ----------------------------------------------------- |
| `import`     | Nhập kho (từ nhà cung cấp, hoặc nhận hàng tại Store). |
| `export`     | Xuất kho (giao hàng cho Store).                       |
| `waste`      | Hao hụt (hàng hỏng, hết hạn bị loại bỏ).              |
| `adjustment` | Điều chỉnh thủ công (kiểm kê, sửa sai).               |

### 2.8. WarehouseType (Loại kho)

| Giá trị          | Ý nghĩa                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `central`        | Kho Trung Tâm (Bếp chính) — chỉ có **duy nhất 1**.                     |
| `store_internal` | Kho nội bộ của Store — mỗi Store tự động được tạo 1 kho khi tạo Store. |

### 2.9. Pagination (Chuẩn chung cho mọi API `GET` danh sách)

**Query Params chuẩn:**

| Param       | Type            | Default | Mô tả                |
| ----------- | --------------- | ------- | -------------------- |
| `page`      | number          | `1`     | Trang hiện tại       |
| `limit`     | number          | `10`    | Số bản ghi mỗi trang |
| `sortBy`    | string          | -       | Sắp xếp theo trường  |
| `sortOrder` | `ASC` \| `DESC` | `DESC`  | Thứ tự sắp xếp       |

**Response `meta` chuẩn:**

```json
{
  "items": [...],
  "meta": {
    "totalItems": 100,
    "itemCount": 10,
    "itemsPerPage": 10,
    "totalPages": 10,
    "currentPage": 1
  }
}
```

---

## 3. Cấu Trúc Response Chuẩn

### 3.1. Response Thành Công

Mọi response thành công đều được bọc bởi `TransformInterceptor`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { ... },
  "timestamp": "2026-02-12T13:00:00.000Z",
  "path": "/wdp301-api/v1/orders"
}
```

> **Lưu ý:** `message` luôn là `"Success"` trừ khi Controller có `@ResponseMessage()` decorator tùy chỉnh.

### 3.2. Response Lỗi

```json
{
  "statusCode": 400,
  "message": "Dữ liệu đầu vào không hợp lệ",
  "errors": [
    { "field": "email", "message": "Email không đúng định dạng" },
    { "field": "password", "message": "Mật khẩu phải có ít nhất 6 ký tự" }
  ],
  "timestamp": "2026-02-12T13:00:00.000Z",
  "path": "/wdp301-api/v1/auth/login"
}
```

**Các mã lỗi thường gặp:**

| Status Code | Ý nghĩa                                   | Message mặc định (Tiếng Việt)                  |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| `400`       | Bad Request (Validation / Business Logic) | Message cụ thể từ nghiệp vụ                    |
| `401`       | Unauthorized (Chưa login / Token hết hạn) | `"Chưa đăng nhập"`                             |
| `403`       | Forbidden (Không có quyền)                | `"Bạn không có quyền truy cập resource này"`   |
| `404`       | Not Found                                 | `"Không tìm thấy tài nguyên: {METHOD} {URL}"`  |
| `429`       | Too Many Requests                         | `"Hệ thống quá tải, vui lòng thử lại sau"`     |
| `500`       | Internal Server Error                     | `"Lỗi máy chủ nội bộ, vui lòng liên hệ Admin"` |

> **Tất cả error message đều bằng Tiếng Việt.** Frontend có thể hiển thị trực tiếp `message` cho người dùng.

---

## 4. Module: Authentication

**Mục đích:** Xác thực người dùng, quản lý phiên đăng nhập, quản lý tài khoản (Admin), quên/đặt lại mật khẩu.

### Endpoints

#### 4.1. `POST /auth/login`

- **Actor:** Public (không cần token)
- **Rate Limit:** 5 lần / 60s
- **Payload:** `{ email: string, password: string }`
- **Response:** Xem [mục 1.3](#bước-1-login)
- **Lỗi thường gặp:**
  - `400`: `"Email không chính xác"` hoặc `"Mật khẩu không chính xác"`
  - `403`: `"Tài khoản của bạn đã bị khóa"` (status = `banned`)

#### 4.2. `POST /auth/refresh-token`

- **Actor:** Public (cần refreshToken hợp lệ)
- **Payload:** `{ refreshToken: string }`
- **Response:** `{ accessToken, refreshToken }` (cặp token mới)
- **Lỗi:** `401`: `"Refresh Token không hợp lệ hoặc đã hết hạn"`

#### 4.3. `GET /auth/me`

- **Actor:** Tất cả User đã đăng nhập
- **Header:** `Authorization: Bearer {accessToken}`
- **Response:**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "Nguyen Van A",
  "role": "franchise_store_staff",
  "storeId": "uuid-or-null",
  "status": "active",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

#### 4.4. `POST /auth/logout`

- **Actor:** User đã đăng nhập
- **Payload:** `{ refreshToken: string }`

#### 4.5. `POST /auth/create-user`

- **Actor:** `admin` only
- **Payload:**

```json
{
  "username": "Nguyen Van A",
  "email": "staff@store.com",
  "password": "123456",
  "role": "franchise_store_staff",
  "storeId": "uuid-store-id"
}
```

- **Business Rules:**
  - Không thể tạo user với role `admin`.
  - Nếu role = `franchise_store_staff` → `storeId` **bắt buộc**.
  - Email phải unique.

#### 4.6. `POST /auth/forgot-password`

- **Actor:** Public | **Payload:** `{ email: string }`
- **Logic:** Gửi OTP 6 số qua email, OTP hết hạn sau **5 phút**.

#### 4.7. `POST /auth/reset-password`

- **Actor:** Public
- **Payload:** `{ email: string, code: string, password: string }`
- **Code** là OTP 6 ký tự nhận qua email.

#### 4.8. `GET /auth/roles`

- **Actor:** `admin` only
- **Response:** Danh sách role (không bao gồm `admin`), format `[{ value, label }]`.

---

## 5. Module: Franchise Store

**Mục đích:** Quản lý danh sách cửa hàng nhượng quyền (CRUD). Khi tạo Store mới, hệ thống **tự động tạo kho nội bộ** (`store_internal`) kèm theo.

### Endpoints

| Method   | Endpoint      | Actor                | Mô tả                                  |
| -------- | ------------- | -------------------- | -------------------------------------- |
| `POST`   | `/stores`     | Manager, Admin       | Tạo store mới (auto tạo warehouse)     |
| `GET`    | `/stores`     | Manager, Coordinator | Danh sách store (phân trang, filter)   |
| `GET`    | `/stores/:id` | Manager              | Chi tiết store                         |
| `PATCH`  | `/stores/:id` | Manager              | Cập nhật store                         |
| `DELETE` | `/stores/:id` | Manager              | Soft-delete store (`isActive = false`) |

**Create Store Payload:**

```json
{
  "name": "KFC Quận 1",
  "address": "123 Nguyễn Huệ, Q.1, TP.HCM",
  "managerName": "Trần Văn B",
  "phone": "0901234567"
}
```

**Query Params (GET):** `page`, `limit`, `search` (tên store), `isActive` (default `true`).

---

## 6. Module: Product & Batch

**Mục đích:** Quản lý Master Data sản phẩm và lô hàng (Batch). Mỗi sản phẩm có nhiều lô; mỗi lô có `batchCode`, `expiryDate`, liên kết tới Inventory.

### 6.1. Products

| Method   | Endpoint                | Actor   | Mô tả                               |
| -------- | ----------------------- | ------- | ----------------------------------- |
| `POST`   | `/products`             | Manager | Tạo sản phẩm (SKU tự sinh)          |
| `GET`    | `/products`             | Manager | Danh sách sản phẩm (phân trang)     |
| `GET`    | `/products/:id`         | Manager | Chi tiết sản phẩm + danh sách batch |
| `PATCH`  | `/products/:id`         | Manager | Cập nhật sản phẩm                   |
| `DELETE` | `/products/:id`         | Manager | Soft-delete (`isActive = false`)    |
| `PATCH`  | `/products/:id/restore` | Manager | Khôi phục sản phẩm đã xóa           |

**Create Product Payload:**

```json
{
  "name": "Gà rán KFC Original",
  "baseUnitId": 1,
  "shelfLifeDays": 3,
  "imageUrl": "https://cdn.com/image.jpg"
}
```

> **Lưu ý:** `sku` được **tự sinh** từ tên sản phẩm, FE không cần gửi. `baseUnitId` phải tham chiếu tới bảng `base_units` đã tồn tại.

### 6.2. Batches

| Method  | Endpoint                | Actor                  | Mô tả                                                |
| ------- | ----------------------- | ---------------------- | ---------------------------------------------------- |
| `GET`   | `/products/batches`     | Manager, Kitchen Staff | Danh sách lô hàng (FEFO sort, kèm `currentQuantity`) |
| `GET`   | `/products/batches/:id` | Manager, Kitchen Staff | Chi tiết lô hàng                                     |
| `PATCH` | `/products/batches/:id` | Manager, Kitchen Staff | Cập nhật lô (ảnh, số lượng ban đầu)                  |

> **Đặc biệt:** Khi cập nhật `initialQuantity`, hệ thống tự động cập nhật Inventory tại **Kho Trung Tâm** và ghi log `adjustment` transaction.

---

## 7. Module: Supplier

**Mục đích:** Quản lý nhà cung cấp (CRUD). Nhà cung cấp được liên kết khi tạo phiếu nhập kho (Inbound).

| Method   | Endpoint         | Actor         | Mô tả                                                 |
| -------- | ---------------- | ------------- | ----------------------------------------------------- |
| `POST`   | `/suppliers`     | Manager       | Tạo NCC                                               |
| `GET`    | `/suppliers`     | Authenticated | Danh sách NCC (phân trang, search, filter `isActive`) |
| `GET`    | `/suppliers/:id` | Authenticated | Chi tiết NCC                                          |
| `PATCH`  | `/suppliers/:id` | Manager       | Cập nhật NCC                                          |
| `DELETE` | `/suppliers/:id` | Manager       | Soft-delete NCC                                       |

**Query Params (GET):** `page`, `limit`, `search` (tên, liên hệ, SĐT), `isActive`.

---

## 8. Module: Inbound Logistics (Nhập kho)

**Mục đích:** Quản lý quy trình nhập hàng từ Nhà cung cấp vào Kho Trung Tâm. Sử dụng cơ chế **Draft → Complete** để đảm bảo dữ liệu chính xác trước khi cộng tồn kho.

### Main Workflow: Luồng Nhập Kho

```
1. Kitchen Staff tạo Phiếu nhập (Draft)
   └─ POST /inbound/receipts { supplierId, note }

2. Scan từng mặt hàng vào phiếu
   └─ POST /inbound/receipts/:id/items { productId, quantity }
   └─ Hệ thống tự sinh: batchCode, expiryDate = today + shelfLifeDays
   └─ Trả về data in tem QR (batchId, batchCode, expiryDate)

3. In tem cho từng lô (nếu cần)
   └─ GET /inbound/batches/:id/label → { qrData, readableData }

4. Kiểm tra xong → Chốt phiếu
   └─ PATCH /inbound/receipts/:id/complete
   └─ Hệ thống trong Transaction:
      ├─ Cập nhật trạng thái Batch → 'available'
      ├─ Upsert Inventory (cộng tồn kho)
      └─ Ghi log InventoryTransaction (type: 'import')
```

### Endpoints

| Method   | Endpoint                         | Actor         | Mô tả                                     |
| -------- | -------------------------------- | ------------- | ----------------------------------------- |
| `POST`   | `/inbound/receipts`              | Kitchen Staff | Tạo phiếu nhập (Draft)                    |
| `GET`    | `/inbound/receipts`              | Kitchen Staff | Danh sách phiếu nhập (phân trang)         |
| `GET`    | `/inbound/receipts/:id`          | Kitchen Staff | Chi tiết phiếu nhập                       |
| `POST`   | `/inbound/receipts/:id/items`    | Kitchen Staff | Thêm hàng vào phiếu                       |
| `PATCH`  | `/inbound/receipts/:id/complete` | Kitchen Staff | Chốt phiếu (Nhập kho chính thức)          |
| `DELETE` | `/inbound/items/:batchId`        | Kitchen Staff | Xóa lô hàng lỗi (chỉ khi phiếu còn Draft) |
| `GET`    | `/inbound/batches/:id/label`     | Kitchen Staff | Lấy data in QR tem                        |
| `POST`   | `/inbound/batches/reprint`       | Kitchen Staff | In lại tem (có ghi log audit)             |

**Add Item Response (quan trọng cho FE):**

```json
{
  "batchId": 42,
  "batchCode": "KFC-ORI-20260212-001",
  "manufactureDate": "2026-02-12T00:00:00.000Z",
  "expiryDate": "2026-02-15T00:00:00.000Z",
  "warning": "Cảnh báo: Sản phẩm có hạn sử dụng ngắn (dưới 48 giờ)"
}
```

> **FE cần hiển thị popup cảnh báo** khi field `warning` có giá trị (sản phẩm có shelf life < 2 ngày).

---

## 9. Module: Inventory (Tồn kho)

**Mục đích:** Xem tồn kho, cảnh báo kho thấp, điều chỉnh thủ công. **Nguyên tắc cốt lõi:** Tồn kho = Warehouse + Batch (Batch-Centric). Không có khái niệm tồn kho "chung" theo Product.

### 9.1. Inventory cho Store Staff

| Method | Endpoint                        | Actor       | Mô tả                                  |
| ------ | ------------------------------- | ----------- | -------------------------------------- |
| `GET`  | `/inventory/store`              | Store Staff | Tồn kho tại Store mình (FEFO sort)     |
| `GET`  | `/inventory/store/transactions` | Store Staff | Lịch sử nhập/xuất/điều chỉnh tại Store |

**Query Params (`/inventory/store`):** `page`, `limit`, `search` (tên sản phẩm hoặc mã batch).

**Response item format:**

```json
{
  "inventoryId": 1,
  "batchId": 42,
  "productId": 5,
  "productName": "Gà rán Original",
  "sku": "KFC-ORI",
  "batchCode": "KFC-ORI-20260212-001",
  "quantity": 25.5,
  "expiryDate": "2026-02-15",
  "unit": "Hộp",
  "imageUrl": "https://..."
}
```

> **Lưu ý:** `quantity` đã được parse thành **number** (không phải string). Data sort theo `expiryDate ASC` (FEFO).

**Transaction response item:**

```json
{
  "transactionType": "import",
  "quantityChange": 50.0,
  "productName": "Gà rán Original",
  "batchCode": "KFC-ORI-20260212-001",
  "createdAt": "2026-02-12T10:00:00.000Z",
  "referenceId": "shipment-uuid"
}
```

**Query Params cho Transactions:** `page`, `limit`, `type` (`import|export|waste|adjustment`), `fromDate`, `toDate`.

### 9.2. Inventory cho Manager

| Method | Endpoint               | Actor   | Mô tả                                           |
| ------ | ---------------------- | ------- | ----------------------------------------------- |
| `GET`  | `/inventory/summary`   | Manager | Tổng hợp tồn kho (group by Product + Warehouse) |
| `GET`  | `/inventory/low-stock` | Manager | Cảnh báo sản phẩm dưới mức tồn kho tối thiểu    |
| `POST` | `/inventory/adjust`    | Manager | Điều chỉnh tồn kho thủ công                     |

**Adjust Payload:**

```json
{
  "warehouseId": 1,
  "batchId": 42,
  "adjustmentQuantity": -5,
  "reason": "Hao hụt do kiểm kê",
  "note": "Phát hiện thiếu 5 hộp"
}
```

> `adjustmentQuantity` có thể **âm** (giảm) hoặc **dương** (tăng). Hệ thống validate: tồn kho sau điều chỉnh **không được < 0**.

### 9.3. Kitchen Inventory (Bếp Trung Tâm)

| Method | Endpoint                                  | Actor                  | Mô tả                                         |
| ------ | ----------------------------------------- | ---------------------- | --------------------------------------------- |
| `GET`  | `/inventory/kitchen/summary`              | Manager, Kitchen Staff | Tổng quan tồn kho bếp (group by Product)      |
| `GET`  | `/inventory/kitchen/details?product_id=5` | Manager, Kitchen Staff | Drill-down chi tiết từng Batch của 1 sản phẩm |

**Kitchen Summary response item (computed fields):**

```json
{
  "product_id": 5,
  "product_name": "Gà rán Original",
  "sku": "KFC-ORI",
  "unit": "Hộp",
  "min_stock": 100,
  "total_physical": 150,
  "total_reserved": 30,
  "available_quantity": 120,
  "is_low_stock": false
}
```

> **FE cần hiển thị cảnh báo** khi `is_low_stock = true` (available < min_stock).
> `total_reserved` là số lượng đang bị "giữ chỗ" cho đơn hàng đã duyệt nhưng chưa xuất kho.

**Kitchen Details response (Drill-down):**

```json
{
  "product_id": 5,
  "total_batches": 3,
  "details": [
    {
      "batch_code": "KFC-ORI-20260210-001",
      "expiry_date": "2026-02-13",
      "physical": 50,
      "reserved": 20,
      "available": 30
    }
  ]
}
```

---

## 10. Module: Order (Đặt hàng)

**Mục đích:** Store đặt hàng → Coordinator duyệt → Hệ thống tự phân bổ kho FEFO → Tạo Shipment.

### Main Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Store Staff: Duyệt catalog → Tạo đơn                       │
│    POST /orders { deliveryDate, items: [{productId, quantity}]} │
│    → status: PENDING                                            │
│                                                                 │
│ 2. Coordinator: Xem danh sách đơn chờ duyệt                    │
│    GET /orders?status=pending                                   │
│                                                                 │
│ 3. Coordinator: Review đơn (so sánh với tồn kho hiện tại)      │
│    GET /orders/coordinator/:id/review                           │
│    → Trả về: requestedQty vs currentStock vs canFulfill         │
│                                                                 │
│ 4. Coordinator: Duyệt hoặc Từ chối                             │
│    ├─ PATCH /orders/coordinator/:id/approve                     │
│    │  → Hệ thống chạy FEFO Engine:                             │
│    │    • Reserve kho (reservedQuantity += takeQty)              │
│    │    • Cập nhật quantityApproved cho mỗi item                │
│    │    • Tạo Shipment + ShipmentItems                          │
│    │    → status: APPROVED                                      │
│    │                                                            │
│    └─ PATCH /orders/coordinator/:id/reject { reason }           │
│       → status: REJECTED                                       │
│                                                                 │
│ 5. (Hoặc) Store Staff tự hủy đơn                               │
│    PATCH /orders/franchise/:id/cancel                           │
│    → status: CANCELLED (chỉ khi còn PENDING)                   │
└─────────────────────────────────────────────────────────────────┘
```

### Business Rules Quan Trọng

#### FEFO Engine (First Expired, First Out)

Khi Coordinator approve, backend tự động:

1. Lấy tất cả Batch của sản phẩm tại **Kho Trung Tâm**, sort theo `expiryDate ASC`.
2. Chọn Batch gần hết hạn nhất trước, lấy `min(remainingNeeded, available)`.
3. `available = quantity - reservedQuantity` (chỉ lấy phần chưa bị reserve).

#### No Backorders (Không nợ hàng)

- Store đặt 50, kho chỉ còn 30 → `quantityApproved = 30`. Phần thiếu 20 **bị hủy**, Store phải đặt lại đơn khác.
- Nếu **tất cả** sản phẩm đều hết kho → Đơn bị **tự động REJECTED**: `"Không thể duyệt đơn do tất cả mặt hàng đã hết tồn kho"`

#### Low Fill-Rate Warning

- Nếu tỷ lệ đáp ứng < 20% → Backend trả về **400** với:

```json
{
  "message": "Tỷ lệ đáp ứng quá thấp (dưới 20%), bạn có chắc chắn muốn giao đơn này không?",
  "fiilRate": "15.00%",
  "canForce": true
}
```

- **FE cần hiển thị popup xác nhận**, nếu user đồng ý → Gọi lại API với `force_approve: true`:

```json
PATCH /orders/coordinator/:id/approve
{ "force_approve": true }
```

#### Cut-off Time (Thời gian chốt đơn)

- `deliveryDate` phải **ít nhất 1 ngày trong tương lai**.
- Đơn đặt **sau 22:00** không thể chọn ngày mai làm `deliveryDate`.

### Endpoints

| Method  | Endpoint                          | Actor                | Mô tả                                   |
| ------- | --------------------------------- | -------------------- | --------------------------------------- |
| `POST`  | `/orders`                         | Store Staff          | Tạo đơn hàng                            |
| `GET`   | `/orders`                         | Manager, Coordinator | Danh sách đơn (phân trang, filter)      |
| `GET`   | `/orders/catalog`                 | Store Staff          | Danh sách sản phẩm khả dụng để đặt hàng |
| `GET`   | `/orders/my-store`                | Store Staff          | Đơn hàng của Store mình                 |
| `GET`   | `/orders/:id`                     | All authenticated    | Chi tiết đơn hàng                       |
| `GET`   | `/orders/coordinator/:id/review`  | Coordinator          | Review đơn + So sánh kho                |
| `PATCH` | `/orders/coordinator/:id/approve` | Coordinator          | Duyệt đơn (chạy FEFO)                   |
| `PATCH` | `/orders/coordinator/:id/reject`  | Coordinator          | Từ chối đơn                             |
| `PATCH` | `/orders/franchise/:id/cancel`    | Store Staff          | Hủy đơn (chỉ khi PENDING)               |

**Create Order Payload:**

```json
{
  "deliveryDate": "2026-02-14T00:00:00.000Z",
  "items": [
    { "productId": 1, "quantity": 50 },
    { "productId": 2, "quantity": 30 }
  ]
}
```

**Query Params (GET /orders):** `page`, `limit`, `status`, `storeId`, `search` (order ID), `fromDate`, `toDate`.

**Approve Response:**

```json
{
  "orderId": "uuid",
  "status": "approved",
  "results": [
    { "productId": 1, "requested": 50, "approved": 30, "missing": 20 },
    { "productId": 2, "requested": 30, "approved": 30, "missing": 0 }
  ]
}
```

> **FE nên hiển thị bảng so sánh** `requested` vs `approved` cho Coordinator sau khi duyệt.

---

## 11. Module: Warehouse Operation (Vận hành kho)

**Mục đích:** Dành cho **Kitchen Staff** soạn hàng, xuất kho, quét mã, báo sự cố. Module này kết nối chặt với Order và Shipment.

### Main Workflow: Soạn hàng → Xuất kho

```
1. Kitchen Staff xem danh sách tác vụ soạn hàng
   GET /warehouse/picking-tasks
   → Danh sách Orders ở trạng thái APPROVED

2. Xem chi tiết cần soạn (FEFO suggest)
   GET /warehouse/picking-tasks/:orderId
   → Danh sách Product + suggestedBatches (lô gợi ý)

3. (Optional) Quét mã Batch kiểm tra
   GET /warehouse/scan-check?batchCode=KFC-ORI-20260212-001

4. (Optional) Báo sự cố lô hỏng
   POST /warehouse/batch/report-issue { batchId, reason }
   → Hệ thống tự tìm lô thay thế cùng sản phẩm

5. Hoàn tất: Duyệt & Xuất kho (hỗ trợ gom nhiều đơn)
   PATCH /warehouse/shipments/finalize-bulk
   → Transaction: Trừ kho + Log export + Shipment → IN_TRANSIT + Order → DELIVERING

6. In phiếu giao hàng
   GET /warehouse/shipments/:id/label
```

### Endpoints

| Method  | Endpoint                                  | Actor         | Mô tả                                |
| ------- | ----------------------------------------- | ------------- | ------------------------------------ |
| `GET`   | `/warehouse/picking-tasks`                | Kitchen Staff | Danh sách tác vụ soạn hàng           |
| `GET`   | `/warehouse/picking-tasks/:id`            | Kitchen Staff | Chi tiết picking list (FEFO suggest) |
| `PATCH` | `/warehouse/picking-tasks/:orderId/reset` | Kitchen Staff | Reset tiến độ soạn hàng              |
| `PATCH` | `/warehouse/shipments/finalize-bulk`      | Kitchen Staff | Xuất kho hàng loạt                   |
| `GET`   | `/warehouse/shipments/:id/label`          | Kitchen Staff | Data in phiếu giao hàng              |
| `GET`   | `/warehouse/scan-check?batchCode=...`     | Kitchen Staff | Quét mã kiểm tra Batch               |
| `POST`  | `/warehouse/batch/report-issue`           | Kitchen Staff | Báo sự cố lô hàng                    |

**Finalize Bulk Payload (gom nhiều đơn):**

```json
{
  "orders": [
    {
      "orderId": "uuid-order-1",
      "pickedItems": [
        { "batchId": 42, "quantity": 30 },
        { "batchId": 43, "quantity": 20 }
      ]
    },
    {
      "orderId": "uuid-order-2",
      "pickedItems": [{ "batchId": 44, "quantity": 15 }]
    }
  ]
}
```

> **Giới hạn:** Tối đa **10 đơn** trong 1 lần xuất kho (`@ArrayMaxSize(10)`).
> **Business Rule:** Nếu `expiryDate` của Batch <= `deliveryDate` của Order → Lỗi `400`: `"Lô hàng ... hết hạn trước ngày giao hàng"`.

**Picking List Response:**

```json
{
  "orderId": "uuid",
  "shipmentId": "uuid",
  "items": [
    {
      "productId": 5,
      "productName": "Gà rán Original",
      "requiredQty": 50,
      "suggestedBatches": [
        {
          "batchCode": "KFC-ORI-20260210-001",
          "qtyToPick": 30,
          "expiry": "2026-02-13"
        },
        {
          "batchCode": "KFC-ORI-20260211-002",
          "qtyToPick": 20,
          "expiry": "2026-02-14"
        }
      ]
    }
  ]
}
```

---

## 12. Module: Shipment (Vận chuyển)

**Mục đích:** Theo dõi lô hàng vận chuyển từ Kho Trung Tâm → Store. Store xác nhận nhận hàng (có thể báo thiếu/hỏng → tự tạo Claim).

### Main Workflow: Nhận hàng tại Store

```
1. Store Staff xem danh sách shipment đang đến
   GET /shipments/store/my

2. Xem chi tiết shipment
   GET /shipments/:id
   → items: [{ batchCode, productName, quantity, expiryDate }]

3a. Nhận hàng nhanh (đủ hàng, không hỏng)
    PATCH /shipments/:id/receive-all
    → Shipment → COMPLETED, Order → COMPLETED
    → Tồn kho Store được cộng toàn bộ

3b. Nhận hàng chi tiết (có sự cố)
    POST /shipments/:id/receive
    Body: {
      "items": [
        { "batchId": 42, "actualQty": 25, "damagedQty": 5, "evidenceUrls": ["url1"] }
      ]
    }
    → Hệ thống tự:
      ├─ Tồn kho Store cộng = actualQty - damagedQty (goodQty)
      ├─ Tạo Claim tự động cho phần thiếu/hỏng
      ├─ Shipment → COMPLETED
      └─ Order → CLAIMED (nếu có discrepancy)
```

### Endpoints

| Method  | Endpoint                      | Actor                | Mô tả                                   |
| ------- | ----------------------------- | -------------------- | --------------------------------------- |
| `GET`   | `/shipments`                  | Manager, Coordinator | Danh sách shipment (phân trang, filter) |
| `GET`   | `/shipments/store/my`         | Store Staff          | Shipment đang đến Store mình            |
| `GET`   | `/shipments/:id`              | Store Staff          | Chi tiết shipment                       |
| `GET`   | `/shipments/:id/picking-list` | Coordinator, Kitchen | Picking list cho nhà kho                |
| `PATCH` | `/shipments/:id/receive-all`  | Store Staff          | Nhận hàng nhanh (đủ hàng)               |
| `POST`  | `/shipments/:id/receive`      | Store Staff          | Nhận hàng chi tiết (báo sự cố)          |

**Query Params (GET /shipments):** `page`, `limit`, `status`, `storeId`, `search` (shipment/order ID), `fromDate`, `toDate`.

**Receive Response:**

```json
{
  "message": "Xác nhận nhận hàng thành công.",
  "shipmentId": "uuid",
  "status": "completed",
  "hasDiscrepancy": true,
  "claimId": "uuid-claim"
}
```

> **FE cần xử lý:** Nếu `hasDiscrepancy = true` → Hiển thị thông báo "Đã tạo khiếu nại tự động" và link tới Claim detail.
> **Chỉ nhận hàng được khi** status = `in_transit`. Các status khác sẽ trả lỗi `400`.

---

## 13. Module: Claim (Khiếu nại)

**Mục đích:** Xử lý hàng thiếu/hỏng sau khi nhận hàng. Claim có thể được tạo **tự động** (khi nhận hàng có discrepancy) hoặc **thủ công** (Store tạo sau khi nhận hàng).

### Manual Claim Rules

1. **Store Ownership:** Chỉ Store sở hữu shipment mới được tạo claim.
2. **Thời hạn 24 giờ:** Chỉ tạo được trong vòng **24 giờ** kể từ khi shipment hoàn thành.
3. **Shipment phải COMPLETED:** Không tạo claim cho shipment chưa hoàn tất.
4. **Kiểm tra tồn kho:** Số lượng claim ≤ tồn kho hiện tại tại Store (nghĩa là Store phải đang có hàng đó).
5. **Ảnh bắt buộc:** Nếu claim hàng hỏng (`quantityDamaged > 0`) → phải có `imageProofUrl`.
6. **Side-effect:** Tạo claim thủ công sẽ **trừ ngay tồn kho Store** cho phần claim.

### Endpoints

| Method  | Endpoint              | Actor                     | Mô tả                                |
| ------- | --------------------- | ------------------------- | ------------------------------------ |
| `GET`   | `/claims`             | Manager, Coordinator      | Danh sách claim (phân trang, filter) |
| `GET`   | `/claims/my-store`    | Store Staff               | Claims của Store mình                |
| `GET`   | `/claims/:id`         | Store/Coordinator/Kitchen | Chi tiết claim                       |
| `POST`  | `/claims`             | Store Staff               | Tạo claim thủ công                   |
| `PATCH` | `/claims/:id/resolve` | Coordinator, Manager      | Chấp nhận/Từ chối claim              |

**Create Manual Claim Payload:**

```json
{
  "shipmentId": "uuid-shipment",
  "description": "Hàng bị nát hộp",
  "items": [
    {
      "productId": 5,
      "batchId": 42,
      "quantityMissing": 3,
      "quantityDamaged": 2,
      "reason": "Hộp bị méo, hàng bên trong bị nát",
      "imageProofUrl": "https://cdn.com/evidence.jpg"
    }
  ]
}
```

**Resolve Claim Payload:**

```json
{
  "status": "approved",
  "resolutionNote": "Đã xác nhận, sẽ gửi bù hàng"
}
```

**Claim Detail Response:**

```json
{
  "id": "uuid",
  "shipmentId": "uuid",
  "status": "pending",
  "createdAt": "2026-02-12T10:00:00.000Z",
  "resolvedAt": null,
  "items": [
    {
      "productName": "Gà rán Original",
      "sku": "KFC-ORI",
      "quantityMissing": 3,
      "quantityDamaged": 2,
      "reason": "Hộp bị méo",
      "imageUrl": "https://cdn.com/evidence.jpg"
    }
  ]
}
```

---

## 14. Special Notes for Frontend

### 14.1. Định dạng Ngày Tháng

| Field                                    | Format trong DB          | Ví dụ                      | Cách FE xử lý                                   |
| ---------------------------------------- | ------------------------ | -------------------------- | ----------------------------------------------- |
| `createdAt`, `updatedAt`, `deliveryDate` | ISO 8601 timestamp (UTC) | `2026-02-12T10:00:00.000Z` | Parse bằng `new Date()`, hiển thị UTC+7         |
| `expiryDate`                             | Date string `YYYY-MM-DD` | `2026-02-15`               | Parse trực tiếp, **không cần convert timezone** |

### 14.2. Xử Lý Số Liệu (Decimal/Float)

- Tồn kho (`quantity`) lưu dạng `DECIMAL(10,2)` trong DB.
- Một số API trả về dạng **string** (`"25.50"`), một số đã parse thành **number** (`25.5`).
- **Khuyến nghị:** Luôn dùng `parseFloat()` khi nhận giá trị tồn kho để đảm bảo tính nhất quán.
- Khi gửi lên: sử dụng **number** (không phải string).

### 14.3. Xử Lý Logic Đặc Biệt Phía FE

| Tình huống                                     | Cách xử lý                                                      |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Login response có `storeId = null`             | User không phải Staff → Ẩn menu "Đặt hàng", "Tồn kho Store"     |
| Approve trả về `400` với `canForce: true`      | Hiện popup xác nhận, nếu OK → gọi lại với `force_approve: true` |
| Inbound add-item trả về `warning`              | Hiện toast/popup cảnh báo sản phẩm hết hạn nhanh                |
| Receive shipment trả về `hasDiscrepancy: true` | Hiện thông báo + link đến trang Claim detail                    |
| Kitchen summary có `is_low_stock: true`        | Đánh dấu dòng sản phẩm bằng màu đỏ/cam                          |
| Order `quantityApproved < quantityRequested`   | Hiển thị cảnh báo "Giao thiếu" bên cạnh item                    |
| Tạo Manual Claim quá 24h                       | API trả `400`, FE disable nút "Tạo khiếu nại" nếu đã quá hạn    |

### 14.4. Data Isolation (Phân quyền dữ liệu)

- **Store Staff chỉ thấy dữ liệu của Store mình.** Backend tự filter dựa trên `storeId` từ JWT token.
- Nếu Store Staff cố truy cập Order/Shipment/Claim của Store khác → `403 Forbidden`.
- Coordinator/Manager có thể xem tất cả dữ liệu.

### 14.5. Validation Errors Format

Khi gửi dữ liệu không hợp lệ, response `errors` là mảng:

```json
{
  "errors": [
    { "field": "email", "message": "Email không đúng định dạng" },
    { "field": "password", "message": "Mật khẩu phải có ít nhất 6 ký tự" }
  ]
}
```

**FE nên:** Map `errors[].field` vào form field tương ứng để hiển thị inline validation.

### 14.6. Whitelist Validation

Backend bật `whitelist: true` + `forbidNonWhitelisted: true`. Nếu FE gửi field không có trong DTO → **Bị reject** với lỗi `400`.

---

## 15. Business Flow Diagrams

### 15.1. Luồng Đặt hàng End-to-End

```
Store Staff              Coordinator              Kitchen Staff              Store Staff
    │                        │                         │                         │
    │── POST /orders ──────>│                         │                         │
    │   (status: PENDING)   │                         │                         │
    │                       │                         │                         │
    │                       │── GET /orders ─────────>│                         │
    │                       │   (review đơn)          │                         │
    │                       │                         │                         │
    │                       │── PATCH approve ───────>│                         │
    │                       │   (FEFO + Reserve)      │                         │
    │                       │   (status: APPROVED)    │                         │
    │                       │   (Shipment: PREPARING) │                         │
    │                       │                         │                         │
    │                       │                         │── GET picking-tasks ──>│
    │                       │                         │── finalize-bulk ──────>│
    │                       │                         │   (Trừ kho + Export)   │
    │                       │                         │   (status: DELIVERING) │
    │                       │                         │   (Shipment: IN_TRANSIT)│
    │                       │                         │                         │
    │                       │                         │            │── PATCH receive-all ─>
    │                       │                         │            │   (Cộng kho Store)
    │                       │                         │            │   (status: COMPLETED)
    │                       │                         │            │   (Shipment: COMPLETED)
```

### 15.2. Luồng Nhập Kho (Inbound)

```
Kitchen Staff
    │
    │── POST /inbound/receipts ──────> Receipt (DRAFT)
    │
    │── POST /inbound/receipts/:id/items ──> Thêm hàng (tự sinh Batch)
    │   (lặp lại cho mỗi mặt hàng)
    │
    │── GET /inbound/batches/:id/label ──> In tem QR
    │
    │── PATCH /inbound/receipts/:id/complete ──> Transaction:
    │       ├── Batch status → 'available'
    │       ├── Inventory += quantity (Kho Trung Tâm)
    │       └── Log InventoryTransaction (type: 'import')
    │
    └── Receipt status → COMPLETED
```

### 15.3. Luồng Khiếu Nại (Claim)

```
Tự động (khi nhận hàng có discrepancy):
  POST /shipments/:id/receive → hasDiscrepancy=true → Claim PENDING

Thủ công (trong vòng 24h):
  POST /claims { shipmentId, items } → Claim PENDING
  → Trừ tồn kho Store ngay lập tức
  → Order status → CLAIMED

Xử lý:
  PATCH /claims/:id/resolve { status: 'approved'|'rejected' }
```

---

> **📌 Ghi nhớ cuối cùng cho Frontend Developer:**
>
> 1. Mọi API đều cần `Authorization: Bearer {token}` (trừ login, refresh-token, forgot/reset password).
> 2. Response luôn wrap trong `{ statusCode, message, data, timestamp, path }`.
> 3. Error message luôn bằng **Tiếng Việt** → có thể hiển thị trực tiếp.
> 4. Sử dụng Swagger UI tại `https://wdp301-api.onrender.com/wdp301-api/docs` để test nhanh.
> 5. Tồn kho là **Batch-Centric**: luôn phải có `batchId` + `warehouseId` khi thao tác.
