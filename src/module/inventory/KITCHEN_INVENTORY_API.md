# Kitchen Inventory API (Bếp trung tâm)

**Phiên bản:** 1.0 — đồng bộ refactor 2026-04-01  
**Base path (global):** `/wdp301-api/v1/inventory` (xem `main.ts` cho prefix + versioning).

## Nguyên tắc chung

1. **Không gửi `warehouseId` từ Frontend.** Backend xác định kho bếp như sau:
   - Nếu JWT có `storeId`: tìm bản ghi `warehouses` với `type = 'central'` và `store_id` khớp `storeId`.
   - Nếu không có liên kết: **fallback** lấy một kho `central` bất kỳ (phục vụ admin / dữ liệu legacy).
2. **Công thức:** `Physical = Available + Reserved` (tổng hợp từ bảng `inventory` theo `warehouse_id` + `batch_id`).
3. **FEFO:** Chi tiết lô sắp xếp `expiry_date ASC`.
4. **Điều chỉnh kho:** Một transaction DB; ghi `inventory_transactions` (`adjust_loss` / `adjust_surplus`); đồng bộ tổng trên `batches`.
5. **Số học:** Phép tính chênh lệch điều chỉnh dùng **BigInt (scale 2 decimals)** trong code để tránh lỗi float JavaScript (tương đương mục tiêu dùng thư viện decimal).

---

## Headers (tất cả endpoint dưới đây)

| Header | Bắt buộc | Mô tả |
|--------|----------|--------|
| `Authorization` | Có | `Bearer <access_token>` |
| `Content-Type` | Chỉ POST | `application/json` |

---

## 1. GET `/inventory/summary`

**Roles:** `manager`, `admin`, `central_kitchen_staff`, `supply_coordinator`

**Query (optional):** `page`, `limit`, `searchTerm`

**Mô tả:** Tổng quan tồn theo **product** tại kho bếp của user.

**Ví dụ response (payload sau lớp wrapper global `data` nếu có interceptor):**

```json
{
  "data": [
    {
      "productId": 101,
      "sku": "PROD-GAKARA-001",
      "productName": "Gà viên Karaage",
      "unit": "KG",
      "totalPhysical": 150,
      "totalAvailable": 120.5,
      "totalReserved": 29.5,
      "stockStatus": "LOW_STOCK",
      "expiryStatus": "NEAR_EXPIRY_ALERT",
      "category": null,
      "suggestedProductionQty": 30
    }
  ],
  "meta": {
    "totalItems": 1,
    "page": 1,
    "itemsPerPage": 20,
    "totalPages": 1
  }
}
```

- `stockStatus`: `OK` | `LOW_STOCK` — so sánh `totalAvailable` với `products.min_stock_level`.
- `expiryStatus`: `OK` | `NEAR_EXPIRY_ALERT` — có lô trong kho với HSD trong vòng **7 ngày** (hằng `KITCHEN_NEAR_EXPIRY_ALERT_DAYS`).
- `category`: hiện `null` (schema `products` chưa có category); có thể bổ sung sau.
- `suggestedProductionQty`: chỉ có khi `LOW_STOCK`, = `max(0, minStock - totalAvailable)`.

---

## 2. GET `/inventory/product/:productId/batches`

**Roles:** `manager`, `admin`, `central_kitchen_staff`, `supply_coordinator`

**Path:** `productId` (integer)

**Mô tả:** Các lô của sản phẩm tại kho bếp; **ORDER BY expiry_date ASC**. Gồm lô chỉ còn reserved.

**Ví dụ response:**

```json
{
  "productId": 101,
  "batches": [
    {
      "batchId": 5002,
      "batchCode": "BTCH-2024-002",
      "expiryDate": "2026-05-15T00:00:00.000Z",
      "physicalQty": 10.5,
      "availableQty": 0,
      "reservedQty": 10.5,
      "status": "NEAR_EXPIRY",
      "isNextFEFO": false
    },
    {
      "batchId": 5001,
      "batchCode": "BTCH-2024-001",
      "expiryDate": "2026-06-01T00:00:00.000Z",
      "physicalQty": 50,
      "availableQty": 50,
      "reservedQty": 0,
      "status": "GOOD",
      "isNextFEFO": true
    }
  ]
}
```

- `status` dòng lô: `GOOD` | `NEAR_EXPIRY` | `EXPIRED` | `DAMAGED` | `EMPTY` (kết hợp `batch.status` + HSD vs `min_shelf_life`).
- `isNextFEFO`: **một** lô — lô đầu tiên theo FEFO có `availableQty > 0`.

---

## 3. POST `/inventory/adjust`

**Roles:** `manager`, `admin`, `central_kitchen_staff`

**Body:**

```json
{
  "batchId": 5001,
  "actualQuantity": 48.5,
  "reasonCode": "PRODUCTION_WASTE",
  "note": "Rơi vãi trong quá trình chế biến"
}
```

**`reasonCode` (enum):** `DAMAGE` | `WASTE` | `PRODUCTION_WASTE` | `INPUT_ERROR` | `EXPIRED`

**Logic:** `difference = actualQuantity - currentPhysical`; cập nhật `inventory.quantity` = `actualQuantity` (giữ `reserved_quantity`); ghi `inventory_transactions` với `quantity_change = difference` (loại `adjust_loss` nếu âm, `adjust_surplus` nếu dương); `referenceId` dạng `ADJ-…`; `createdBy` = `sub` từ JWT.

**Ràng buộc:** `actualQuantity >= reserved` (physical không được nhỏ hơn reserved).

**Ví dụ response:**

```json
{
  "batchId": 5001,
  "physicalQty": 48.5,
  "availableQty": 38.5,
  "reservedQty": 10,
  "referenceId": "ADJ-A1B2C3D4E5",
  "quantityChange": -1.5
}
```

---

## 4. GET `/inventory/transactions`

**Roles:** `manager`, `admin`, `central_kitchen_staff`, `supply_coordinator`

**Query (optional):** `batchId`, `type`, `fromDate`, `toDate`, `page`, `limit`

- `type`: một trong các giá trị enum PostgreSQL: `import`, `export`, `waste`, `adjustment`, `production_consume`, `production_output`, `reservation`, `release`, `adjust_loss`, `adjust_surplus`.
- Response map nhóm điều chỉnh: `adjust_loss` / `adjust_surplus` / `adjustment` → nhãn `ADJUSTMENT` trong JSON.

**Ví dụ response:**

```json
{
  "data": [
    {
      "id": 999,
      "timestamp": "2024-05-20T10:00:00.000Z",
      "type": "ADJUSTMENT",
      "batchCode": "BTCH-2024-001",
      "changeQty": -1.5,
      "reason": "PRODUCTION_WASTE | Rơi vãi",
      "staffName": "kitchen_staff_01",
      "referenceId": "ADJ-A1B2C3D4E5"
    }
  ],
  "meta": {
    "totalItems": 1,
    "itemCount": 1,
    "itemsPerPage": 10,
    "totalPages": 1,
    "currentPage": 1
  }
}
```

---

## Endpoint khác (không đổi path trong refactor này)

- `GET /inventory/kitchen/summary`, `GET /inventory/kitchen/details` — logic cũ (macro/drill-down theo kho central global) vẫn tồn tại; ưu tiên dùng các route JWT ở trên cho UI bếp mới.
- `GET /inventory/store`, `GET /inventory/store/transactions` — cửa hàng franchise.

---

## Trả lời nhanh cho Tech Lead (đặc tả vs “rối loạn”)

Đặc tả đã bao phủ: tổng quan theo SKU, drill-down FEFO + highlight lô xuất kế tiếp, điều chỉnh sau kiểm kê/hỏng với audit, lịch sử theo lô/khoảng thời gian. Phần mở rộng sau nếu cần: gắn **category** khi có cột/category master; tùy chỉnh ngưỡng NEAR_EXPIRY theo từng SKU; workflow phê duyệt điều chỉnh qua `inventory_adjustment_tickets` (đã có trong schema, chưa gắn vào route này).
