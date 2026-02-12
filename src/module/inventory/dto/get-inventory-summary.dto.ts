import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetInventorySummaryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm kho bằng id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouseId?: number;

  @ApiPropertyOptional({
    description: 'Tìm kiếm sản phẩm bằng tên hoặc mã SKU',
  })
  @IsOptional()
  @IsString()
  searchTerm?: string;
}
