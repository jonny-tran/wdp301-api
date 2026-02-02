import { ApiProperty } from '@nestjs/swagger';

export class InventoryDto {
  @ApiProperty()
  inventoryId: number;
  @ApiProperty()
  batchId: number;
  @ApiProperty()
  productId: number;
  @ApiProperty()
  productName: string;
  @ApiProperty()
  sku: string;
  @ApiProperty()
  batchCode: string;
  @ApiProperty()
  quantity: number;
  @ApiProperty()
  expiryDate: Date;
  @ApiProperty()
  unit: string;
  @ApiProperty({ nullable: true })
  imageUrl: string | null;
}
