import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CompleteSalvageDto {
  @ApiProperty({
    description:
      'Sản lượng thành phẩm thực tế thu được (theo đơn vị thành phẩm của công thức)',
    example: 4.2,
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  actualYield: number;

  @ApiPropertyOptional({
    description: 'Bắt buộc khi thực tế vượt định mức lý thuyết theo BOM',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  surplusNote?: string;
}
