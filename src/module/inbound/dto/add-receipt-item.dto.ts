import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

/** Thêm dòng hàng (có thể tách nhiều HSD/NSX); lô chỉ được tạo khi chốt phiếu */
export class AddReceiptItemDto {
  @ApiProperty({ description: 'ID sản phẩm', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({
    description: 'Số lượng đạt chuẩn nhập kho (chỉ phần này tạo lô)',
    example: 90,
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  quantityAccepted: number;

  @ApiProperty({
    description: 'Số lượng từ chối (hỏng, không đạt)',
    example: 10,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantityRejected?: number;

  @ApiPropertyOptional({
    description: 'Bắt buộc khi quantityRejected > 0',
    example: 'Bao bì rách, không đạt nhiệt độ',
  })
  @ValidateIf((o: AddReceiptItemDto) => (o.quantityRejected ?? 0) > 0)
  @IsString()
  @IsNotEmpty({ message: 'Phải nhập lý do từ chối khi có hàng loại' })
  rejectionReason?: string;

  @ApiProperty({
    description: 'Ngày sản xuất gốc (bắt buộc — truy xuất nguồn gốc)',
    example: '2026-03-20',
  })
  @IsString()
  @IsNotEmpty()
  manufacturedDate: string;

  @ApiPropertyOptional({
    description:
      'Hạn sử dụng thực tế của lô (tách lô khác HSD, ví dụ trứng). Nếu bỏ trống: NSX + shelf life',
    example: '2026-03-25',
  })
  @IsOptional()
  @IsString()
  statedExpiryDate?: string;

  @ApiPropertyOptional({
    description: 'Số lượng dự kiến theo đặt hàng (dùng kiểm tra nhập dư / sai số)',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedQuantity?: number;

  @ApiPropertyOptional({
    description: 'Mã vị trí kệ (có thể bổ sung khi chốt phiếu nếu chưa quét)',
  })
  @IsOptional()
  @IsString()
  storageLocationCode?: string;
}
