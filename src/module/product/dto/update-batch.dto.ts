import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUrl, Min } from 'class-validator';

export class UpdateBatchDto {
  @ApiProperty({
    description: 'Sửa lại số lượng ban đầu',
    example: 120,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  initialQuantity?: number;

  @ApiProperty({ description: 'Cập nhật ảnh minh chứng', required: false })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
