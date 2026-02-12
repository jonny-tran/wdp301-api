import { ApiProperty } from '@nestjs/swagger';

export class InventoryAdjustmentDto {
  @ApiProperty()
  warehouseId: number;

  @ApiProperty()
  batchId: number;

  @ApiProperty()
  adjustmentQuantity: number;

  @ApiProperty()
  reason: string;

  @ApiProperty({ required: false })
  note?: string;
}
