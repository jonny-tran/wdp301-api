import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';

/** Trạng thái lệnh sản xuất (khớp DB enum) */
export const PRODUCTION_ORDER_STATUSES = [
  'draft',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type ProductionOrderStatusValue =
  (typeof PRODUCTION_ORDER_STATUSES)[number];

export class GetProductionOrdersQueryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description:
      'Lọc trạng thái: một hoặc nhiều giá trị (lặp query hoặc CSV). Ví dụ: draft,in_progress',
    example: 'draft,in_progress',
    isArray: true,
    enum: PRODUCTION_ORDER_STATUSES,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) {
      return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
    }
    return String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn([...PRODUCTION_ORDER_STATUSES], { each: true })
  status?: ProductionOrderStatusValue[];
}
