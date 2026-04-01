import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RecipeItemDto } from './create-recipe.dto';

export class UpdateRecipeDto {
  @ApiPropertyOptional({
    description:
      'Đổi thành phẩm đầu ra (finished_good); đồng bộ tên công thức theo sản phẩm',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  productId?: number;

  @ApiPropertyOptional({
    type: [RecipeItemDto],
    description:
      'Nếu gửi: thay toàn bộ dòng BOM (ít nhất 1 dòng). Không gửi = giữ nguyên định mức.',
  })
  @IsOptional()
  @ValidateIf((o: UpdateRecipeDto) => o.items !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items?: RecipeItemDto[];

  @ApiPropertyOptional({ description: 'Bật/tắt công thức (soft)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
