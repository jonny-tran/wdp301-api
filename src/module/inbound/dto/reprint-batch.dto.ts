import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class ReprintBatchDto {
  @ApiProperty({ description: 'ID lô hàng cần in lại', example: 10 })
  @IsNumber()
  @IsNotEmpty()
  batchId: number;
}
