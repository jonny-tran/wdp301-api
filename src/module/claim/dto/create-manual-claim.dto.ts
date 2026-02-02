import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateManualClaimItemDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  batchId: number;

  @ApiProperty({ description: 'Quantity missing', minimum: 0 })
  @IsNumber()
  @Min(0)
  quantityMissing: number;

  @ApiProperty({ description: 'Quantity damaged', minimum: 0 })
  @IsNumber()
  @Min(0)
  quantityDamaged: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageProofUrl?: string;
}

export class CreateManualClaimDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  shipmentId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: [CreateManualClaimItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateManualClaimItemDto)
  items: CreateManualClaimItemDto[];
}
