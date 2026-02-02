import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectOrderDto {
  @ApiProperty({
    example: 'Out of stock on key ingredients',
    description: 'Reason for rejecting the order',
  })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lý do không được để trống' })
  reason: string;
}
