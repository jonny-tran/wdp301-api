import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

/** Query GET /inventory/summary (bếp) — không có warehouseId; kho lấy từ JWT */
export class KitchenSummaryQueryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Lọc theo tên sản phẩm hoặc SKU',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  searchTerm?: string;
}
