import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CoordinationSummaryQueryDto {
  @ApiProperty({
    description: 'Ngày giao hàng (YYYY-MM-DD). Tổng hợp theo DATE(delivery_date).',
    example: '2026-10-10',
  })
  @IsDateString()
  deliveryDate!: string;
}

