import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';
//thêm hàng hóa vào phiếu (chứa thông tin chi tiết như Sản phẩm, Số lượng, Hạn sử dụng để sinh Batch).
export class AddReceiptItemDto {
  @ApiProperty({ description: 'ID sản phẩm', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({ description: 'Số lượng nhập', example: 50 })
  @IsNumber()
  @Min(0.1)
  @IsNotEmpty()
  quantity: number;
}
