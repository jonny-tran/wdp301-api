import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

/** Lọc theo `inventory_transactions.type` (PostgreSQL enum) */
export enum TransactionType {
  IMPORT = 'import',
  EXPORT = 'export',
  WASTE = 'waste',
  ADJUSTMENT = 'adjustment',
  PRODUCTION_CONSUME = 'production_consume',
  PRODUCTION_OUTPUT = 'production_output',
  RESERVATION = 'reservation',
  RELEASE = 'release',
  ADJUST_LOSS = 'adjust_loss',
  ADJUST_SURPLUS = 'adjust_surplus',
}

export class GetInventoryTransactionsDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Lọc theo lô' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchId?: number;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo loại giao dịch',
    enum: TransactionType,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    description: 'Từ ngày (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD)',
    example: '2026-02-12',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
