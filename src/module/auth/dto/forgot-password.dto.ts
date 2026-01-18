import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

// 1. Gửi yêu cầu lấy OTP
export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@gmail.com', description: 'Email tài khoản' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsString({ message: 'Email phải là chuỗi' })
  email: string;
}

// 2. Đổi mật khẩu bằng OTP
export class ResetPasswordDto {
  @ApiProperty({ example: 'admin@gmail.com', description: 'Email tài khoản' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsString({ message: 'Email phải là chuỗi' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Mã OTP 6 số nhận được qua email',
  })
  @IsString({ message: 'Mã OTP phải là chuỗi' })
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  code: string;

  @ApiProperty({ example: 'NewPass@123', description: 'Mật khẩu mới' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  password: string;
}
