import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionRequestLineDto {
  @ApiProperty({ example: 1, description: 'ID sản phẩm cần yêu cầu sản xuất bù' })
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiProperty({
    example: 10,
    description:
      'Số lượng muốn bếp sản xuất bù. Theo rule hiện tại thường bằng đúng shortage (missing) của đơn.',
  })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class ApproveOrderDto {
  @ApiProperty({
    example: true,
    description: 'Xác nhận duyệt đơn dù tỷ lệ đáp ứng thấp',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  force_approve?: boolean;

  @ApiPropertyOptional({
    description:
      'Bắt buộc khi giá catalog lệch >20% so với snapshot trên đơn (xác nhận đã thông báo cửa hàng)',
  })
  @IsOptional()
  @IsBoolean()
  price_acknowledged?: boolean;

  @ApiPropertyOptional({
    description:
      'Xác nhận đã phối hợp bếp khi thiếu hàng (partial fulfillment trước khi giao)',
  })
  @IsOptional()
  @IsBoolean()
  production_confirm?: boolean;

  @ApiPropertyOptional({
    description:
      'Tuỳ chọn: danh sách mặt hàng thiếu mà Supply Coordinator muốn gửi "Yêu cầu sản xuất" xuống Central Kitchen. ' +
      'Lưu ý: đây là luồng độc lập (No Backorder) — không treo đơn hiện tại, chỉ tạo lệnh sản xuất phục vụ các đơn sau.',
    type: () => [ProductionRequestLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionRequestLineDto)
  productionRequests?: ProductionRequestLineDto[];
}
