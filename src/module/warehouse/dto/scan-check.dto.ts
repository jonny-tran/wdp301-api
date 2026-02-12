import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ScanCheckDto {
  @ApiProperty({ description: 'Mã QR trên thùng hàng', example: 'GA-2024-001' })
  @IsString()
  @IsNotEmpty()
  batchCode: string;
}
