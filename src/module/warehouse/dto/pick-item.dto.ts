import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class PickItemDto {
  @ApiProperty({
    description: 'Mã đơn hàng đang soạn',
    example: 'uuid-order-123',
  })
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'ID sản phẩm của món hàng', example: 10 })
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({
    description: 'Mã lô hàng nhân viên vừa quét',
    example: 'GA-2024-001',
  })
  @IsString()
  @IsNotEmpty()
  batchCode: string;

  @ApiProperty({ description: 'Số lượng lấy thực tế', example: 5 })
  @IsNumber()
  @Min(0.1)
  quantity: number;
}
