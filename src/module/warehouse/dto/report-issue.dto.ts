import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ReportIssueDto {
  @ApiProperty({ example: 101, description: 'ID của Lô hàng bị lỗi' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  batchId: number;

  @ApiProperty({
    example: 'damaged',
    description: 'Lý do: hỏng hóc, thiếu hụt...',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
