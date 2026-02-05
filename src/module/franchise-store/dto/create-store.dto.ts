import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'KFC Nguyen Thai Hoc' })
  @IsNotEmpty({ message: 'Tên cửa hàng không được để trống' })
  @IsString()
  name: string;

  @ApiProperty({ example: '123 Nguyen Thai Hoc, Q1, TP.HCM' })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString()
  address: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Nguyen Van A', required: false })
  @IsOptional()
  @IsString()
  managerName?: string;
}
