import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUrl, Min } from 'class-validator';

export class CreateBatchDto {
  @ApiProperty({ description: 'Số lượng ban đầu', example: 100 })
  @IsNumber()
  @Min(1)
  initialQuantity: number;

  @ApiProperty({
    description: 'Ảnh minh chứng lô hàng (tùy chọn)',
    example: 'https://cdn.com/batch.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
