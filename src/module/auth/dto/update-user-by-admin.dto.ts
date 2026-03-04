import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from './create-user.dto';
import { UserStatusFilter } from './get-users.dto';

export class UpdateUserByAdminDto {
  @ApiPropertyOptional({
    enum: UserStatusFilter,
    description: 'Trạng thái tài khoản',
  })
  @IsEnum(UserStatusFilter)
  @IsOptional()
  status?: UserStatusFilter;

  @ApiPropertyOptional({ enum: UserRole, description: 'Vai trò' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Email mới' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại' })
  @IsString()
  @IsOptional()
  phone?: string;
}
