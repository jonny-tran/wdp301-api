import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';
import { ClaimStatus } from '../constants/claim-status.enum';
import { Type } from 'class-transformer';

export class GetClaimsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    enum: ClaimStatus,
    description: 'Lọc theo trạng thái xử lý',
  })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo Mã Claim hoặc Mã Shipment',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo Store ID',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Từ ngày (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Đến ngày (YYYY-MM-DD)',
    example: '2026-06-12',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;
}
