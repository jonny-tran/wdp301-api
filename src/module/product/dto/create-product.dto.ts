import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ProductType } from '../constants/product-type.enum';

export class CreateProductDto {
  @ApiProperty({ description: 'Tên sản phẩm', example: 'Gà rán KFC Original' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'ID đơn vị tính', example: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  baseUnitId: number;

  @ApiProperty({ description: 'Hạn sử dụng (số ngày)', example: 3 })
  @IsInt()
  @Min(1)
  shelfLifeDays: number;

  @ApiProperty({
    description: 'Đường dẫn ảnh sản phẩm',
    example: 'https://cdn.com/image.jpg',
  })
  @IsNotEmpty()
  @IsUrl()
  imageUrl: string;

  @ApiPropertyOptional({
    enum: ProductType,
    description:
      'Mặc định raw_material. finished_good / resell_product cho hàng đặt từ cửa hàng.',
    default: ProductType.RAW_MATERIAL,
  })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;
}
