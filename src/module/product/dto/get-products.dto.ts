import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetProductsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo trạng thái hoạt động',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên hoặc mã SKU',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
