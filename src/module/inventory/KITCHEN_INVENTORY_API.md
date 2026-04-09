# Kitchen Inventory API (đồng bộ code mới)

Base path: `/inventory`

## 1) Endpoint matrix

| Method | Path | Roles |
|---|---|---|
| GET | `/inventory/summary` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/product/:productId/batches` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/transactions` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| POST | `/inventory/adjust` | `manager`,`admin`,`central_kitchen_staff` |
| POST | `/inventory/waste` | `manager`,`admin`,`central_kitchen_staff` |
| GET | `/inventory/kitchen/summary` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/kitchen/details` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/analytics/summary` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/analytics/aging` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/analytics/waste` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/analytics/waste-report` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |
| GET | `/inventory/analytics/financial/loss-impact` | `manager`,`admin`,`central_kitchen_staff`,`supply_coordinator` |

## 2) Quy tắc dữ liệu quan trọng cho FE

- Không gửi `warehouseId` cho luồng kitchen JWT-based, backend tự resolve kho trung tâm.
- Công thức luôn đúng: `physical = available + reserved`.
- FEFO theo `expiryDate ASC`.
- Batch status hiển thị:
  - `GOOD`, `NEAR_EXPIRY`, `EXPIRED`, `DAMAGED`, `EMPTY`
  - Với `EXPIRED|DAMAGED|EMPTY`, backend trả `availableQty = 0` (không hiểu nhầm là đủ hàng).

## 3) Contract chính từng endpoint

- `GET /inventory/summary`
  - Query: `page`, `limit`, `searchTerm`
  - Trả theo product + `stockStatus`, `expiryStatus`, `suggestedProductionQty`

- `GET /inventory/product/:productId/batches`
  - Trả danh sách batch theo FEFO
  - Có `isNextFEFO` cho batch khả dụng kế tiếp

- `POST /inventory/adjust`
  - Body: `batchId`, `actualQuantity`, `reasonCode`, `note?`
  - Tạo `adjust_loss` hoặc `adjust_surplus`

- `POST /inventory/waste`
  - Body: `batch_id`, `reason`, `note?`
  - Tiêu hủy toàn bộ tồn lô ở kho trung tâm
  - Ghi `inventory_transactions.type = waste`
  - Cập nhật trạng thái lô tương ứng

- `GET /inventory/transactions`
  - Query: `batchId`, `type`, `fromDate`, `toDate`, `page`, `limit`
  - Hỗ trợ type: `import`,`export`,`waste`,`adjustment`,`production_consume`,`production_output`,`reservation`,`release`,`adjust_loss`,`adjust_surplus`

## 4) Chính sách Waste-only

- Không còn transaction type `salvage`.
- FE chỉ dùng:
  - `POST /inventory/waste` cho hàng hỏng/hết hạn cần hủy
  - `POST /inventory/adjust` cho kiểm kê chênh lệch.
