import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecipeItemDto {
  @ApiProperty({
    description:
      'ID sản phẩm nguyên liệu (chỉ chấp nhận loại raw_material trên server)',
  })
  @IsNumber()
  @Min(1)
  productId: number;

  @ApiProperty({
    description: 'Định mức nguyên liệu cho 1 đơn vị thành phẩm đầu ra',
  })
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateRecipeDto {
  @ApiProperty({
    description: 'ID thành phẩm đầu ra (finished_good)',
  })
  @IsNumber()
  @Min(1)
  productId: number;

  @ApiProperty({ type: [RecipeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items: RecipeItemDto[];
}
