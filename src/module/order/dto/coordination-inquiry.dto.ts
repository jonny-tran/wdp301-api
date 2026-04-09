import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class CoordinationInquiryLineDto {
  @ApiProperty({ example: 1, description: 'ID sản phẩm thành phẩm cần hỏi bếp' })
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiProperty({
    example: 200,
    description:
      'Số lượng muốn hỏi bếp có thể sản xuất thêm (thường = shortage theo tổng cầu - ATP).',
  })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class CoordinationInquiryDto {
  @ApiProperty({
    description: 'Ngày giao hàng (YYYY-MM-DD).',
    example: '2026-10-10',
  })
  @IsDateString()
  deliveryDate!: string;

  @ApiPropertyOptional({
    description:
      'Tuỳ chọn: nếu FE đã tính shortage/đặt câu hỏi cụ thể cho bếp thì gửi danh sách này. ' +
      'Nếu không gửi, BE sẽ tự tính shortage theo tổng cầu (pending) và ATP kho trung tâm.',
    type: () => [CoordinationInquiryLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinationInquiryLineDto)
  lines?: CoordinationInquiryLineDto[];
}

