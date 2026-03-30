import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class VerifyManifestItemDto {
  @ApiProperty({ description: 'ID dòng shipment_items' })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  shipmentItemId: number;

  @ApiProperty({ description: 'ID lô quét được (phải trùng lô FEFO chỉ định)' })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  scannedBatchId: number;
}
