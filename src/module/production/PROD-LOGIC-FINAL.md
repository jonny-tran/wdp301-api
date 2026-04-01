# Đặc tả nghiệp vụ sản xuất (BOM & lệnh)
**Mã phân hệ:** PROD-LOGIC | **Version:** 1.2

## 0. API tóm tắt (`/production`)

| Method | Path | Ý nghĩa |
|--------|------|--------|
| POST | `/production/recipes` | Tạo BOM |
| POST | `/production/orders` | Tạo lệnh **draft** (body: `productId` + `plannedQuantity`) |
| POST | `/production/orders/:id/start` | Kiểm tồn/HSD, tạm giữ NL (FEFO) |
| POST | `/production/orders/:id/complete` | Ghi nhận sản lượng thực tế, trừ NL, tạo lô TP + lineage |

## 1. Tạo công thức — `POST /production/recipes` (`CreateRecipeDto`)

- **`productId`:** sản phẩm **đầu ra** — bắt buộc **`finished_good`**, active.
- **`items[]`:** mỗi phần tử có **`productId`** (nguyên liệu) + **`quantity`**.
  - Nguyên liệu phải là **`raw_material`**, active; **không** trùng `productId` với thành phẩm đầu ra.
- **`quantity`:** định mức nguyên liệu cho **đúng 1 đơn vị** thành phẩm (không còn khái niệm `standardOutput` / batch mẻ chuẩn).
- **Tên công thức (`recipes.name`):** server gán theo **tên sản phẩm thành phẩm** — **không** nhập tay trên API.

## 2. Tạo lệnh sản xuất — `POST /production/orders` (`CreateProductionOrderDto`)

- **`productId`:** thành phẩm **`finished_good`** (active).
- Hệ thống tìm **mọi** recipe `is_active` trùng `output_product_id`; **phải đúng 1** recipe — nếu 0 → 404, nếu >1 → 400 (tránh nhầm BOM).
- **`plannedQuantity`:** số lượng thành phẩm dự kiến (cùng đơn vị với SP đầu ra).
- `warehouseId` kho trung tâm do server chọn (controller), không gửi từ FE.

## 3. Nhu cầu nguyên liệu khi start (FEFO)

Với mỗi dòng BOM:

`need = quantityPerOutput × plannedQuantity`

(trong đó `quantityPerOutput` lấy từ `recipe_items`, `plannedQuantity` từ lệnh).

## 4. Cơ chế tạm giữ FEFO (bước start)

Trước khi bếp vào ca:

- **Check BOM:** đã có ở lệnh (qua `recipe_id`).
- **Check tồn:** FEFO theo `expiryDate`, chỉ dùng lô chưa hết hạn (so với ngày hiện tại VN).
- **Lock:** tăng `reserved_quantity` trên `inventory`, ghi `production_reservations`.

## 5. Công thức hạn dùng thành phẩm

Hạn dùng lô TP = min(NSX + shelf life lý thuyết, min(HSD các lô nguyên liệu đã tiêu hao)) — thành phẩm không được “sống” lâu hơn nguyên liệu đầu vào.

## 6. Hao hụt & dư thừa (complete)

- **Planned** trên lệnh vs **actual** nhập vào: chênh lệch → `PRODUCTION_LOSS` / `PRODUCTION_SURPLUS` (+ giải trình khi dư).
- Manager/Admin có ngưỡng duyệt khi dư vượt % so với planned (xem `production.constants`).

## 7. Lineage

`batch_lineage`: lô nguyên liệu (parent) → lô thành phẩm (child), kèm `consumed_quantity` và `production_order_id`.
