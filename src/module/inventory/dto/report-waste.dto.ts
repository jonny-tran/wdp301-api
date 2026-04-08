import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

/** Lý do tiêu hủy toàn bộ lô hàng */
export enum WasteReason {
  EXPIRED = 'EXPIRED',
  DAMAGED = 'DAMAGED',
}

export class ReportWasteDto {
  @ApiProperty({ description: 'ID của Lô hàng cần tiêu hủy', example: 1 })
  @IsInt()
  @IsPositive()
  batchId!: number;

  @ApiProperty({
    description: 'Lý do tiêu hủy lô',
    enum: WasteReason,
    example: WasteReason.EXPIRED,
  })
  @IsEnum(WasteReason)
  reason!: WasteReason;

  @ApiPropertyOptional({
    description: 'Ghi chú chi tiết thêm (nếu có)',
    example: 'Lô hàng bị ẩm mốc sau khi kiểm kho',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
