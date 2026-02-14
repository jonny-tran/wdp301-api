import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class ClaimSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID Sản phẩm' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;
}
