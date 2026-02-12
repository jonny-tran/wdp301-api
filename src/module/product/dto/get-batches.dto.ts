import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetBatchesDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm sản phẩm theo ID',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiPropertyOptional({
    description: 'Tìm kiếm nhà cung cấp theo ID',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({
    description: 'Ngày hết hạn (Từ ngày) (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Ngày hết hạn (Đến ngày) (YYYY-MM-DD)',
    example: '2026-02-12',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
