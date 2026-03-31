import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetInboundProductsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Lọc theo tên hoặc SKU (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
