import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUrl, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Mã SKU duy nhất cho sản phẩm',
    example: 'PROD-001',
  })
  @IsNotEmpty()
  @IsString()
  sku: string;

  @ApiProperty({ description: 'Tên sản phẩm', example: 'Gà rán KFC Original' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Đơn vị tính cơ bản', example: 'Kg' })
  @IsNotEmpty()
  @IsString()
  baseUnit: string;

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
}
