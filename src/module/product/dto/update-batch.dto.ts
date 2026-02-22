import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsUrl, Min } from 'class-validator';

export enum BatchStatus {
  PENDING = 'pending',
  AVAILABLE = 'available',
  EMPTY = 'empty',
  EXPIRED = 'expired',
}

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

  @ApiProperty({
    description: 'Cập nhật trạng thái lô hàng',
    enum: BatchStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}
