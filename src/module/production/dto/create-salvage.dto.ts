import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsPositive,
  Min,
} from 'class-validator';

export class CreateSalvageDto {
  @ApiProperty({ description: 'ID lô nguyên liệu cần tận dụng (batches.id)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inputBatchId: number;

  @ApiProperty({ description: 'ID công thức (BOM một nguyên liệu trùng sản phẩm trên lô)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recipeId: number;

  @ApiProperty({
    description: 'Khối lượng nguyên liệu tiêu thụ (đơn vị cùng base unit trên lô)',
    example: 10.5,
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantityToConsume: number;
}
