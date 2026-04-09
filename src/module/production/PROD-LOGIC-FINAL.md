# Production Module — API Contract (BOM & Production Orders)

## 1) Chính sách nghiệp vụ hiện tại

- **Salvage đã loại bỏ hoàn toàn**.
- Hàng lỗi/hỏng xử lý qua luồng **Waste** của Inventory.
- Production chỉ còn luồng chuẩn:
  - tạo BOM
  - tạo lệnh sản xuất
  - start (reserve FEFO nguyên liệu)
  - complete (consume nguyên liệu + output thành phẩm)

## 2) Endpoint matrix (`/production`)

| Method | Path | Roles | Mục đích |
|---|---|---|---|
| POST | `/production/recipes` | `manager`,`central_kitchen_staff` | Tạo BOM |
| GET | `/production/recipes` | `manager`,`central_kitchen_staff`,`admin` | Danh sách BOM |
| GET | `/production/recipes/:id` | `manager`,`central_kitchen_staff`,`admin` | Chi tiết BOM |
| PATCH | `/production/recipes/:id` | `manager`,`central_kitchen_staff` | Cập nhật BOM |
| DELETE | `/production/recipes/:id` | `manager`,`central_kitchen_staff` | Soft-delete BOM |
| GET | `/production/orders` | `manager`,`central_kitchen_staff`,`supply_coordinator`,`admin` | Danh sách lệnh |
| GET | `/production/orders/:id` | `manager`,`central_kitchen_staff`,`supply_coordinator`,`admin` | Chi tiết lệnh + reservation + lineage + inventory tx |
| POST | `/production/orders` | `manager`,`central_kitchen_staff` | Tạo lệnh sản xuất (`draft` hoặc `pending`) |
| POST | `/production/orders/:id/start` | `central_kitchen_staff` | Reserve nguyên liệu theo FEFO |
| POST | `/production/orders/:id/complete` | `central_kitchen_staff` | Hoàn tất lệnh, tạo batch thành phẩm |

## 3) Hợp đồng dữ liệu FE cần bám

- `POST /production/recipes` (`CreateRecipeDto`)
  - `productId` đầu ra phải là `finished_good`
  - `items[].productId` nguyên liệu phải là `raw_material`
  - `items[].quantity` là định mức cho 1 đơn vị output

- `POST /production/orders` (`CreateProductionOrderDto`)
  - `productId`, `plannedQuantity`
  - `warehouseId` được backend resolve (kho trung tâm)
  - nếu lệnh tạo từ phối hợp order (`referenceId`) thì status là `pending`, ngược lại là `draft`

- `POST /production/orders/:id/complete` (`CompleteProductionDto`)
  - `actualQuantity`
  - `surplusNote?` bắt buộc khi sản lượng vượt định mức

## 4) Rule nghiệp vụ chính

- `start`:
  - chỉ chạy khi order `draft|pending`
  - reserve nguyên liệu theo FEFO + shelf-life rules
  - ghi `production_reservations`
  - set order `in_progress`

- `complete`:
  - consume nguyên liệu đã reserve
  - tạo batch thành phẩm mới + update inventory
  - ghi inventory transaction:
    - `production_consume`
    - `production_output`
    - `waste` (nếu loss)
    - `adjustment` (nếu surplus)
  - tạo `batch_lineage` parent -> child
  - set order `completed`

## 5) FE lưu ý khi tích hợp

- Không gọi bất kỳ endpoint `/production/salvage*` (đã bị remove).
- Màn hình production detail nên hiển thị:
  - reservation theo batch
  - lineage
  - inventory transactions có `referenceId = PRODUCTION:{id}`
- Khi complete thành công, luôn refetch order detail vì có batch mới và lineage mới.
