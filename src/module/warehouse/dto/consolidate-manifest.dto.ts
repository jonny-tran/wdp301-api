import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ConsolidateManifestDto {
  @ApiProperty({
    description:
      'Danh sách ID đơn hàng (UUID) đã duyệt, cùng tuyến, chưa gán shipment_id',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds: string[];

  @ApiProperty({ description: 'ID xe (vehicles.id)', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId: number;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  driverName?: string;
}
