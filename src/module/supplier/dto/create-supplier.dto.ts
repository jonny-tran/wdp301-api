import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({
    example: 'Công ty TNHH Thực Phẩm ABC',
    description: 'Tên nhà cung cấp',
  })
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description: 'Tên người liên hệ đại diện',
  })
  @IsOptional()
  @IsString({ message: 'Tên người liên hệ phải là chuỗi ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  contactName?: string;

  @ApiPropertyOptional({
    example: '0901234567',
    description: 'Số điện thoại liên hệ (10 chữ số)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Số điện thoại không đúng định dạng (VD: 0901234567)',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
    description: 'Địa chỉ nhà cung cấp',
  })
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @Transform(({ value }: { value: string }) => value?.trim())
  address?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Trạng thái hoạt động',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái phải là kiểu boolean' })
  isActive?: boolean;
}
