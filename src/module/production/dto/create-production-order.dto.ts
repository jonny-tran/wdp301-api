import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  recipeId: number;

  @ApiProperty({ description: 'Số lượng thành phẩm cần sản xuất' })
  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  outputQuantity: number;
}
