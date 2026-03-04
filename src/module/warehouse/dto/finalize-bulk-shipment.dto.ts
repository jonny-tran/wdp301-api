import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'ID của lô hàng (Batch) thực tế đã lấy ra từ kho',
    example: 42,
  })
  @IsNumber()
  @IsNotEmpty()
  batchId: number;

  @ApiProperty({
    description: 'Số lượng thực tế đã lấy từ lô này',
    example: 50.5,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  quantity: number;
}

export class OrderFulfillmentDto {
  @ApiProperty({
    description: 'Mã UUID của Đơn hàng (Order) đang được xử lý',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Danh sách các mặt hàng đã soạn xong cho đơn hàng này',
    type: [PickedItemDto],
    minItems: 1,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PickedItemDto)
  pickedItems: PickedItemDto[];
}

export class FinalizeBulkShipmentDto {
  @ApiProperty({
    description:
      'Danh sách các đơn hàng cần được duyệt xuất kho đồng loạt. (Tối đa 10 đơn/lần để đảm bảo hiệu năng)',
    type: [OrderFulfillmentDto],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => OrderFulfillmentDto)
  orders: OrderFulfillmentDto[];
}
