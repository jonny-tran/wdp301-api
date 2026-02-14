import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class InventorySummaryQueryDto {
  @ApiPropertyOptional({
    description:
      'Lọc theo ID danh mục (Chưa có bảng Category nên tạm để dạng số)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}

export class AgingReportQueryDto {
  @ApiPropertyOptional({
    description: 'Ngưỡng ngày cảnh báo (Mặc định: không giới hạn)',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  daysThreshold?: number;
}

export class WasteReportQueryDto {
  @ApiPropertyOptional({
    description: 'Từ ngày (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
export class FinancialLossQueryDto {
  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
