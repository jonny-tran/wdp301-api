import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetSuppliersDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm theo tên nhà cung cấp, người liên hệ hoặc SĐT',
    example: 'Công ty A',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Lọc trạng thái hoạt động (true: Đang hoạt động, false: Ngừng hoạt động)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
