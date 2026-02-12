import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PickedItemDto {
  @IsNumber()
  @IsNotEmpty()
  batchId: number;

  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  quantity: number;
}

export class OrderFulfillmentDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PickedItemDto)
  pickedItems: PickedItemDto[];
}

export class FinalizeBulkShipmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => OrderFulfillmentDto)
  orders: OrderFulfillmentDto[];
}
