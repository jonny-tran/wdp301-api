import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export enum TransactionType {
  IMPORT = 'import',
  EXPORT = 'export',
  WASTE = 'waste',
  ADJUSTMENT = 'adjustment',
}

export class GetInventoryTransactionsDto extends PaginationParamsDto {
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
