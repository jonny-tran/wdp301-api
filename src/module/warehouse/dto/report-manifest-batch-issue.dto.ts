import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ReportManifestBatchIssueDto {
  @ApiProperty({ description: 'ID dòng shipment_items cần báo hỏng lô' })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  shipmentItemId: number;

  @ApiProperty({ example: 101, description: 'ID lô đang chỉ định (phải khớp suggested)' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  batchId: number;

  @ApiProperty({ example: 'Lô biến chất, không dùng được' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
