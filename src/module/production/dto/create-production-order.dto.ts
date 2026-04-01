import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty({
    description:
      'ID sản phẩm thành phẩm (finished_good); hệ thống chọn công thức active duy nhất',
  })
  @IsInt()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({ description: 'Số lượng thành phẩm dự kiến (planned)' })
  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  plannedQuantity: number;
}
