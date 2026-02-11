import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';
import { OrderStatus } from '../constants/order-status.enum';

export class GetOrdersDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Trạng thái đơn hàng',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo Mã đơn hàng (ID)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID cửa hàng',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Từ ngày (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
