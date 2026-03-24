import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

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
}
