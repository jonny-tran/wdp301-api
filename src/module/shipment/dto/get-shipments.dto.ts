import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';
import { ShipmentStatus } from '../constants/shipment-status.enum';

export class GetShipmentsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Trạng thái vận chuyển',
    enum: ShipmentStatus,
  })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({
    description: 'ID cửa hàng (UUID)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo Mã Shipment hoặc Mã đơn hàng',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Từ ngày (YYYY-MM-DD)',
    example: '2026-02-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
