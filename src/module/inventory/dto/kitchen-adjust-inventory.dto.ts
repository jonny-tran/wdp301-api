import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { KitchenInventoryAdjustReasonCode } from '../constants/inventory-adjust-reason.enum';

export class KitchenAdjustInventoryDto {
  @ApiProperty({ description: 'ID lô cần điều chỉnh' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  batchId: number;

  @ApiProperty({
    description: 'Số lượng thực tế sau kiểm đếm (physical tại kho bếp JWT)',
    example: 48.5,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualQuantity: number;

  @ApiProperty({ enum: KitchenInventoryAdjustReasonCode })
  @IsEnum(KitchenInventoryAdjustReasonCode)
  reasonCode: KitchenInventoryAdjustReasonCode;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
