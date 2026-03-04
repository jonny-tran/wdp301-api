import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiProperty({
    description: 'Giá trị cấu hình mới',
    example: '10',
  })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({
    description: 'Mô tả thêm',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
