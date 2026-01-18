import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@gmail.com',
    description: 'Email đăng nhập',
    required: true,
  })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Mật khẩu đăng nhập ',
    required: true,
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  password: string;
}
