import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetKitchenInventoryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm sản phẩm bằng tên',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
