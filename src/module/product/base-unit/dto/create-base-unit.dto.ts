import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBaseUnitDto {
  @ApiProperty({ description: 'Tên đơn vị tính', example: 'Kg' })
  @IsNotEmpty({ message: 'Tên đơn vị tính không được để trống' })
  @IsString({ message: 'Tên đơn vị tính phải là chuỗi' })
  name: string;

  @ApiProperty({ description: 'Mô tả', example: 'Kilogram', required: false })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string;
}
