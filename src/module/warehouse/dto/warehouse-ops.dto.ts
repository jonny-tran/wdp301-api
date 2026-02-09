import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

// 1. DTO cho API Report Issue (Báo cáo lô lỗi)
export class ReportIssueDto {
  @ApiProperty({ example: 101, description: 'ID của Batch bị lỗi' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  batchId: number;

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
  orderId: string;
}

// 3. Response DTO cho Picking List (Để Swagger hiển thị đúng mẫu JSON)
export class PickingListResponseDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty({ isArray: true })
  items: {
    productName: string;
    requiredQty: number;
    suggestedBatches: {
      batchCode: string;
      qtyToPick: number;
      expiry: string;
      location?: string;
    }[];
  }[];
}

// bổ sung
export class PickItemDto {
  @ApiProperty({ description: 'Order ID đang soạn', example: 'uuid-order-123' })
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Product ID của món hàng', example: 10 })
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty({
    description: 'Mã lô nhân viên vừa quét',
    example: 'GA-2024-001',
  })
  @IsString()
  @IsNotEmpty()
  batchCode: string;

  @ApiProperty({ description: 'Số lượng lấy', example: 5 })
  @IsNumber()
  @Min(0.1)
  quantity: number;
}

export class ResetTaskDto {
  @ApiProperty({
    description: 'Lý do reset',
    example: 'Nhân viên chọn nhầm lô quá nhiều',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ScanCheckDto {
  @ApiProperty({ description: 'Mã QR trên thùng hàng', example: 'GA-2024-001' })
  @IsString()
  @IsNotEmpty()
  batchCode: string;
}
