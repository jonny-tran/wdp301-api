import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectOrderDto {
  @ApiProperty({
    example: 'Out of stock on key ingredients',
    description: 'Reason for rejecting the order',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
