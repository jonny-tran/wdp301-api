import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetPickingTasksDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Ngày giao hàng (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo Mã đơn hàng hoặc Tên cửa hàng',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
