import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class FinalizeShipmentDto {
  @ApiProperty({ example: 'UUID-ORDER-123', description: 'Mã đơn hàng' })
  @IsUUID()
  @IsNotEmpty()
  orderId: string;
}
