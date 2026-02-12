import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';
import { ReceiptStatus } from '../constants/receipt-status.enum';

export class GetReceiptsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    enum: ReceiptStatus,
    description: 'Lọc theo trạng thái phiếu nhập (draft, completed, cancelled)',
  })
  @IsOptional()
  @IsEnum(ReceiptStatus)
  status?: ReceiptStatus;

  @ApiPropertyOptional({
    description: 'Tìm kiếm nhà cung cấp theo ID',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({
    description: 'Tìm kiếm phiếu nhập theo ID',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Ngày kết thúc(YYYY-MM-DD)',
    example: '2026-01-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
