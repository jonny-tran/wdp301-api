import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Điều chỉnh tồn (hao hụt / dư) — luôn qua InventoryService + transaction. */
export class AdjustmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchId: number;

  /** Âm = giảm tồn (hao hụt), dương = tăng tồn (kiểm kê dư). */
  @IsNumber()
  quantityDelta: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceImage?: string | null;

  @IsOptional()
  @IsUUID()
  createdBy?: string | null;
}

export type OrderItemLockLine = {
  orderItemId: number;
  productId: number;
  quantityRequested: number;
};
