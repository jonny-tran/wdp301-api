-- BOM: định mức nguyên liệu theo 1 đơn vị thành phẩm; bỏ standard_output.
-- Dữ liệu cũ: nếu trước đây quantity_per_output gắn với standard_output, cần chỉnh tay cho khớp công thức mới.
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "standard_output";
