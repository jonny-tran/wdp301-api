import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, Min } from 'class-validator';
//thêm hàng hóa vào phiếu (chứa thông tin chi tiết như Sản phẩm, Số lượng, Hạn sử dụng để sinh Batch).
export class AddReceiptItemDto {
  @ApiProperty({ description: 'ID sản phẩm', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({ description: 'Số lượng nhập', example: 50 })
  @IsNumber()
  @Min(0.1)
  quantity: number;

  @ApiProperty({
    description: 'Ngày sản xuất',
    example: '2026-01-01T00:00:00Z',
  })
  @IsDateString()
  manufacturingDate: string;

  @ApiProperty({ description: 'Hạn sử dụng', example: '2026-12-31T00:00:00Z' })
  @IsDateString()
  expiryDate: string;
}
