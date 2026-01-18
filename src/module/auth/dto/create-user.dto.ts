import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  SUPPLY_COORDINATOR = 'supply_coordinator',
  CENTRAL_KITCHEN_STAFF = 'central_kitchen_staff',
  FRANCHISE_STORE_STAFF = 'franchise_store_staff',
}

export class CreateUserDto {
  @ApiProperty({
    example: 'Nguyen Van A',
    description: 'Tên hiển thị của nhân viên (Display Name)',
  })
  @IsString({ message: 'Tên hiển thị phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên hiển thị không được để trống' })
  username: string;

  @ApiProperty({
    example: 'manager.q1@gmail.com',
    description: 'Email đăng nhập (Bắt buộc duy nhất)',
  })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsString({ message: 'Email phải là chuỗi' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Mật khẩu đăng nhập (Tối thiểu 6 ký tự)',
  })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  password: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.FRANCHISE_STORE_STAFF,
    description: 'Vai trò trong hệ thống',
  })
  @IsEnum(UserRole, { message: 'Vai trò không hợp lệ' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  role: UserRole;

  @ApiPropertyOptional({
    description: 'ID của cửa hàng (Bắt buộc nếu role là nhân viên cửa hàng)',
    example: 'uuid-store-id-here',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Store ID phải là UUID v4' })
  @Transform(({ value }: { value: string }) => value?.trim())
  storeId?: string;
}
