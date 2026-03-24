import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ProductionConfirmDto {
  @ApiProperty({ description: 'Bếp có nhận làm bù hay không' })
  @IsBoolean()
  isAccepted: boolean;

  @ApiPropertyOptional({
    description: 'Mã lô dự kiến khi bếp nhận làm',
    example: 'BATCH-2026-001',
  })
  @IsOptional()
  @IsString()
  expectedBatchCode?: string;
}
