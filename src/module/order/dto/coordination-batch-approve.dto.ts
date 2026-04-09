import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AllocationItemDto {
  @ApiProperty({ example: 10, description: 'ID dòng order_items' })
  @IsInt()
  @Min(1)
  orderItemId!: number;

  @ApiProperty({
    example: 80,
    description:
      'Số lượng phân bổ muốn duyệt cho dòng này (<= quantityRequested).',
  })
  @IsNumber()
  @Min(0)
  quantityApproved!: number;
}

export class OrderAllocationDto {
  @ApiProperty({ example: 'uuid-order-id', description: 'ID đơn hàng' })
  @IsString()
  orderId!: string;

  @ApiProperty({ type: () => [AllocationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  items!: AllocationItemDto[];
}

export class CoordinationBatchApproveDto {
  @ApiProperty({
    description:
      'Ngày giao hàng (YYYY-MM-DD). BE sẽ chỉ xử lý các đơn đúng ngày này.',
    example: '2026-10-10',
  })
  @IsDateString()
  deliveryDate!: string;

  @ApiProperty({
    description:
      'Danh sách phân bổ theo từng đơn (từ UI Allocation). Mỗi đơn gồm các dòng order_item và số lượng muốn duyệt.',
    type: () => [OrderAllocationDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderAllocationDto)
  orderApprovals!: OrderAllocationDto[];

  @ApiProperty({
    required: false,
    description:
      'Tuỳ chọn: bypass cảnh báo fill-rate thấp (<20%) theo rule cũ.',
    example: true,
  })
  @IsOptional()
  force_approve?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Tuỳ chọn: xác nhận lệch giá nếu có (giống approve lẻ).',
    example: true,
  })
  @IsOptional()
  price_acknowledged?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Tuỳ chọn: xác nhận phối hợp bếp khi thiếu hàng (giống approve lẻ).',
    example: true,
  })
  @IsOptional()
  production_confirm?: boolean;
}

