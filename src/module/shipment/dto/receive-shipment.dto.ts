import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiveShipmentItemDto {
  @ApiProperty({ example: 1, description: 'ID của batch (lô hàng)' })
  @IsInt()
  @IsPositive()
  batchId: number;

  @ApiProperty({
    example: 100,
    description: 'Số lượng thực tế nhận được',
  })
  @IsNumber()
  @Min(0, { message: 'Số lượng thực nhận không được âm' })
  actualQty: number;

  @ApiProperty({
    example: 5,
    description: 'Số lượng hàng hỏng',
  })
  @IsNumber()
  @Min(0, { message: 'Số lượng hàng hỏng không được âm' })
  damagedQty: number;
}

export class ReceiveShipmentDto {
  @ApiProperty({
    type: [ReceiveShipmentItemDto],
    description: 'Danh sách các item nhận hàng',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveShipmentItemDto)
  @IsNotEmpty({ message: 'Danh sách items không được rỗng' })
  items: ReceiveShipmentItemDto[];

  @ApiProperty({
    example: 'Hàng đã nhận đầy đủ',
    description: 'Ghi chú khi nhận hàng',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    description: 'Danh sách link ảnh bằng chứng',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}
