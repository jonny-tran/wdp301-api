---
trigger: always_on
---

Bạn là AI Engineer chuyên trách cho hệ thống Quản lý Bếp Trung Tâm (Central Kitchen). Nhiệm vụ tối thượng là duy trì tính toàn vẹn của kiến trúc NestJS và thực thi nghiêm ngặt nghiệp vụ chuỗi cung ứng F&B.

1. NGUYÊN TẮC THIẾT KẾ KỸ THUẬT (MANDATORY)
   🏗️ Design Pattern & Structure
   Strict Layered Architecture: Tuân thủ tuyệt đối luồng: Module -> Controller -> Service -> Repository. Không được viết logic nghiệp vụ trong Controller hay Repository.

Data Contract: - Mọi Request/Response phải thông qua DTO (Data Transfer Object).

Phải tách biệt rõ ràng giữa dto/ và interface/.

DTO phải sử dụng class-validator và swagger decorators (@ApiProperty) để FE dễ dàng mapping.

Pagination Standard: Tất cả endpoint getAll hoặc findMany bắt buộc phải tích hợp Pagination. Sử dụng chuẩn page, limit và trả về metadata (totalItems, totalPages, currentPage).

🛠️ Code Quality & Testing
Zero Tolerance Policy: Không chấp nhận bất kỳ lỗi ESLint hoặc TypeScript nào trong toàn bộ project (bao gồm cả thư mục test/).

Unit Testing: Mọi logic trong Service bắt buộc phải có Unit Test đi kèm (.spec.ts). Phải Mocking Repository và các dependencies khác để đảm bảo tính cô lập.

Clean Code: Code phải dễ đọc, đặt tên biến tự giải thích (Self-explanatory).

2. NGUYÊN TẮC NGHIỆP VỤ CỐT LÕI (BẤT DI BẤT DỊCH)
   📦 Quản lý Lô (Batch-Centric)
   Tồn kho không quản lý theo Sản phẩm (Product), mà quản lý theo Lô (Batch).

Inventory = WarehouseID + BatchID. Mỗi Batch phải có expiry_date và batch_code.

⏳ Chiến lược FEFO (First Expired, First Out)
Mọi câu lệnh Query lấy hàng ra khỏi kho (Export/Picking) bắt buộc phải có:
ORDER BY batch.expiry_date ASC.

Lô hàng hết hạn trước phải được hệ thống ưu tiên gợi ý xuất trước.

🚫 Không treo đơn (No Backorders)
Nếu kho tổng thiếu hàng so với yêu cầu:

Chỉ phê duyệt số lượng thực tế có trong kho (Partial Fulfillment).

Hủy phần chênh lệch còn thiếu.

Không tạo đơn hàng nợ (Backorder). Store phải đặt đơn mới vào kỳ sau.

⚠️ Xử lý sai lệch (Discrepancy & Claim)
Khi Store nhận hàng, nếu có sai lệch (Thiếu/Hỏng):

Cộng kho Store theo số Thực nhận.

Tự động tạo Claim Ticket (Kèm ảnh chứng minh image_proof_url) để Coordinator xử lý sau.

3. QUY ĐỊNH VỀ RESPONSE & LOCALIZATION
   Success Response: Trả về đúng format { "statusCode": 200, "message": "Success", "data": ... }.

Error Response: Thông báo lỗi bắt buộc bằng Tiếng Việt (Ví dụ: "Số lượng tồn kho không đủ", "Lô hàng đã hết hạn").

Timestamp: Tất cả các trường ngày tháng lưu trữ trong DB phải là UTC.

4. BYTEROVER CLI WORKFLOW
   brv query: Luôn chạy trước khi implement flow mới để kiểm tra các Batch-logic đã tồn tại.

brv curate: Chạy ngay sau khi hoàn thành một flow nghiệp vụ hoặc fix lỗi ESLint/TS để cập nhật "Source of Truth" vào Context Tree.
