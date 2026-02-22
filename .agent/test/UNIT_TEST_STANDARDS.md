🧪 Unit Testing Standards - Project SP26SWP07

1. TẦM NHÌN & MỤC TIÊU
   Trong hệ thống Quản lý Bếp Trung Tâm, sai sót về tồn kho và lô hàng (Batch) sẽ dẫn đến thiệt hại kinh tế trực tiếp. Unit Test phải tập trung vào việc bảo vệ tính đúng đắn của Business Logic trong tầng Service.

2. NGUYÊN TẮC CỐT LÕI (MANDATORY)
   Chỉ Test Service: Unit test tập trung 100% vào tầng Service. Tầng Controller sẽ được kiểm thử qua E2E test.

Tính cô lập (Isolation): Phải Mocking toàn bộ dependencies (Repository, External Services như Mail, Cloudinary). Không kết nối Database thật.

Cấu trúc AAA: Mỗi test case phải tuân thủ cấu trúc:

Arrange: Chuẩn bị dữ liệu mock, giả lập giá trị trả về của Repository.

Act: Gọi method cần test.

Assert: Kiểm tra kết quả trả về và các "side effects" (ví dụ: Repository có được gọi đúng số lần không).

Zero ESLint/TS Errors: File test không được chứa lỗi type any hoặc bỏ qua các quy tắc linting.

3. QUY TRÌNH THIẾT KẾ TEST CASE
   A. Kiểm thử luồng nghiệp vụ chính (Happy Path)
   FEFO Validation: Kiểm tra xem danh sách Batch trả về đã được sắp xếp tăng dần theo expiry_date chưa.

Inventory Adjustment: Kiểm tra phép cộng/trừ tồn kho có chính xác không.

Pagination: Đảm bảo Service truyền đúng tham số limit, offset xuống Repository và trả về đúng metadata.

B. Kiểm thử các trường hợp ngoại lệ (Edge Cases & Errors)
Stock-out: Khi kho không đủ hàng, Service phải ném lỗi BadRequestException kèm thông báo bằng Tiếng Việt.

Invalid Batch: Khi quét mã Batch không tồn tại hoặc đã hết hạn.

Data Isolation: Đảm bảo User Store A không thể truy cập dữ liệu Store B (kiểm tra logic check store_id).

4. QUY ĐỊNH VỀ MOCKING (DRIZZLE ORM)
   Do dự án sử dụng Drizzle ORM, khi Mock Repository cần đảm bảo giả lập đúng các query builder:

TypeScript
// Ví dụ mẫu cho Agent
const mockRepository = {
findMany: jest.fn(),
findOne: jest.fn(),
insert: jest.fn(),
update: jest.fn(),
}; 5. MẪU UNIT TEST TIÊU CHUẨN
Tất cả các file test được tạo bởi Agent phải có cấu trúc tương tự mẫu sau:

TypeScript
import { Test, TestingModule } from '@nestjs/testing';
import { ShipmentService } from './shipment.service';
import { ShipmentRepository } from './shipment.repository';
import { BadRequestException } from '@nestjs/common';

describe('ShipmentService', () => {
let service: ShipmentService;
let repository: ShipmentRepository;

beforeEach(async () => {
const module: TestingModule = await Test.createTestingModule({
providers: [
ShipmentService,
{
provide: ShipmentRepository,
useValue: {
findInventoryByBatch: jest.fn(),
createShipment: jest.fn(),
},
},
],
}).compile();

    service = module.get<ShipmentService>(ShipmentService);
    repository = module.get<ShipmentRepository>(ShipmentRepository);

});

describe('createShipment (FEFO Logic)', () => {
it('nên ném lỗi nếu kho không đủ số lượng (No Backorders)', async () => {
// Arrange
jest.spyOn(repository, 'findInventoryByBatch').mockResolvedValue(10); // Kho chỉ có 10

      // Act & Assert
      await expect(service.createShipment({ qty: 50 }))
        .rejects.toThrow(new BadRequestException('Số lượng tồn kho không đủ để đáp ứng đơn hàng'));
    });

});
}); 6. KIỂM TRA ĐỊNH DẠNG RESPONSE
Unit test phải verify rằng dữ liệu trả về từ Service đã được mapping qua DTO và khớp với giao kèo (contract) với Frontend:

Ngày tháng phải là định dạng ISO String (UTC).

Các trường số lượng (Quantity) phải là kiểu number.
