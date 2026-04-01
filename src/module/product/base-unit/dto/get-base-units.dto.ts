import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../../common/dto/pagination-params.dto';

/** Query danh sách đơn vị tính: phân trang + lọc */
export class GetBaseUnitsDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên đơn vị' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái hoạt động' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;
}
