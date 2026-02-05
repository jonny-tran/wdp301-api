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

export class GetInventorySummaryDto {
  @ApiProperty({ required: false })
  warehouseId?: number;

  @ApiProperty({ required: false })
  searchTerm?: string;
}

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

export class LowStockItemDto {
  @ApiProperty()
  productId: number;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  sku: string;

  @ApiProperty()
  minStockLevel: number;

  @ApiProperty()
  currentQuantity: number;

  @ApiProperty()
  unit: string;
}
