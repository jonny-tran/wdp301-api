import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

export class GetStoresFilterDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
