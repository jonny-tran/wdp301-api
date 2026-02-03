import { ApiProperty } from '@nestjs/swagger';
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
}
