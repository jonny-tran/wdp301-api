import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecipeItemDto {
  @ApiProperty({ description: 'ID sản phẩm nguyên liệu' })
  @IsNumber()
  @Min(1)
  materialId: number;

  @ApiProperty({ description: 'Định mức nguyên liệu theo standardOutput' })
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateRecipeDto {
  @ApiProperty({ description: 'ID thành phẩm đầu ra (product)' })
  @IsNumber()
  @Min(1)
  productId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      'Định mức đầu ra chuẩn của công thức (ví dụ 10). Định mức nguyên liệu tính trên đơn vị này.',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  standardOutput?: number;

  @ApiProperty({ type: [RecipeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items: RecipeItemDto[];
}
