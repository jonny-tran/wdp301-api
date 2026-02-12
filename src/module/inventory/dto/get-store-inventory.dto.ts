import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetStoreInventoryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm theo tên sản phẩm hoặc mã batch',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
