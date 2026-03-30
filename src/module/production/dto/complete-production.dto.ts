import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteProductionDto {
  @ApiPropertyOptional({
    description:
      'Bắt buộc khi sản lượng thực tế vượt định mức (dư thừa): giải trình ngắn',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  surplusNote?: string;

  @ApiProperty({ description: 'Số lượng thành phẩm thực thu' })
  @IsNumber()
  @Min(0.0001)
  actualQuantity: number;
}
