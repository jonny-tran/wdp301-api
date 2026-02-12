import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiveItemDto {
  @ApiProperty({ example: 1, description: 'ID của batch (lô hàng)' })
  @IsInt()
  @IsPositive()
  batchId: number;

  @ApiProperty({
    example: 100,
    description: 'Số lượng thực tế nhận được (Actual Qty)',
  })
  @IsNumber()
  @Min(0, { message: 'Số lượng thực nhận không được âm' })
  actualQty: number;

  @ApiProperty({
    example: 0,
    description: 'Số lượng hàng hỏng (Damaged Qty)',
  })
  @IsNumber()
  @Min(0, { message: 'Số lượng hàng hỏng không được âm' })
  damagedQty: number;

  @ApiPropertyOptional({
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    description: 'Danh sách link ảnh bằng chứng (nếu có hàng hỏng/thiếu)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ReceiveShipmentDto {
  @ApiPropertyOptional({
    type: [ReceiveItemDto],
    description: 'Danh sách các item có sự cố (nếu để trống = Nhận đủ)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items?: ReceiveItemDto[];

  @ApiPropertyOptional({
    example: 'Hàng đã nhận, có một số hộp bị móp',
    description: 'Ghi chú khi nhận hàng',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
