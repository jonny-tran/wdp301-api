import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsNumber, Min } from 'class-validator';

// 1. DTO cho API Report Issue (Báo cáo lô lỗi)
export class ReportIssueDto {
  @ApiProperty({ example: 101, description: 'ID của Batch bị lỗi' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  batch_id: number;

  @ApiProperty({
    example: 'damaged',
    description: 'Lý do: damaged, missing...',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

// 2. DTO cho API Finalize Shipment (Hoàn tất xuất kho)
export class FinalizeShipmentDto {
  @ApiProperty({ example: 'UUID-ORDER-123', description: 'Order ID' })
  @IsUUID()
  @IsNotEmpty()
  order_id: string;
}

// 3. Response DTO cho Picking List (Để Swagger hiển thị đúng mẫu JSON)
export class PickingListResponseDto {
  @ApiProperty()
  order_id: string;

  @ApiProperty({ isArray: true })
  items: {
    product_name: string;
    required_qty: number;
    suggested_batches: {
      batch_code: string;
      qty_to_pick: number;
      expiry: string;
      location?: string;
    }[];
  }[];
}
