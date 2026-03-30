# 🥗 ĐẶC TẢ NGHIỆP VỤ SẢN XUẤT (FINALIZED)
**Mã phân hệ:** PROD-LOGIC | **Version:** 1.1

## 1. Cơ chế Tạm giữ FEFO (Step 1-3)
Trước khi bắt đầu nấu nướng/sơ chế, hệ thống thực hiện:
- **Check BOM**: Xác định định mức từ `recipes`.
- **Check Tồn**: Tìm các lô hàng có `expiryDate` gần nhất (FEFO) tại `warehouseId` chỉ định.
- **Lock**: Cộng `reserved_quantity` để ngăn các đơn hàng khác "cướp" mất nguyên liệu đang chuẩn bị nấu.

## 2. Công thức tính Hạn sử dụng (Expiry)
Hạn dùng của lô thành phẩm ($E_{FG}$) được tính bằng:
$$E_{FG} = \min(MfgDate + ShelfLife, \min(E_{Materials}))$$
*Giải thích: Thành phẩm không bao giờ được phép có hạn dùng xa hơn hạn dùng của bất kỳ nguyên liệu nào cấu thành nên nó.*

## 3. Quy tắc ghi nhận Hao hụt & Dư thừa
Hệ thống sử dụng **Snapshot Logic**:
- **Planned Qty**: Con số lý thuyết (Snapshot từ BOM).
- **Actual Qty**: Số lượng thực tế nhân viên bếp nhập vào.
- **Chênh lệch**: 
    - Nếu < 0: Ghi nhận `PRODUCTION_LOSS` (Hao hụt).
    - Nếu > 0: Ghi nhận `PRODUCTION_SURPLUS` + Giải trình (Note).

## 4. Truy xuất nguồn gốc (Lineage)
Bảng `batch_lineage` lưu vết:
- **Parent**: Các lô bột, lô gà, lô gia vị.
- **Child**: Lô gà rán thành phẩm.
=> Cho phép trả lời câu hỏi: "Lô gà rán này được làm từ bao nhiêu kg bột của nhà cung cấp X, nhập ngày nào?"
