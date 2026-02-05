import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum WarehouseType {
  CENTRAL = 'central',
  STORE_INTERNAL = 'store_internal',
}

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kho chi nhánh 2' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ enum: WarehouseType, example: WarehouseType.STORE_INTERNAL })
  @IsNotEmpty()
  @IsEnum(WarehouseType)
  type: WarehouseType;

  @ApiProperty({ example: 'uuid-store-id', required: false })
  @IsOptional()
  @IsString()
  storeId?: string;
}
