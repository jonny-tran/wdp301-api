import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dto/pagination-params.dto';
import { ProductType } from '../constants/product-type.enum';

/** Query chung: phân trang + lọc danh sách sản phẩm (Admin / Manager / …) */
export class ProductFilterDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên hoặc mã SKU',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái hoạt động',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ProductType,
    description:
      'raw_material (bếp), finished_good (TP đặt hàng), resell_product (Coca/Pepsi…)',
  })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;
}
