import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from 'src/common/dto/pagination-params.dto';
import { UserRole } from './create-user.dto';

/** Giá trị khớp cột users.status (enum user_status trong DB) */
export enum UserStatusFilter {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
  PENDING = 'pending',
  REJECTED = 'rejected',
}

export class GetUsersDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Lọc theo vai trò',
    enum: UserRole,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái',
    enum: UserStatusFilter,
  })
  @IsEnum(UserStatusFilter)
  @IsOptional()
  status?: UserStatusFilter;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên hoặc email',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
