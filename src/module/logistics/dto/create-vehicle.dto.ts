import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export const VEHICLE_STATUSES = [
  'available',
  'in_transit',
  'maintenance',
] as const;

export type VehicleStatusValue = (typeof VEHICLE_STATUSES)[number];

export class CreateVehicleDto {
  @ApiProperty({
    example: '51H-12345',
    description: 'Biển số đăng ký (duy nhất trong hệ thống)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Biển số không được để trống' })
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  licensePlate: string;

  @ApiProperty({
    example: 500,
    description: 'Tải trọng (kg)',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'payload_capacity phải là số dương' },
  )
  @IsPositive({ message: 'payload_capacity phải là số dương' })
  payloadCapacity: number;

  @ApiProperty({
    example: 0.15,
    description: 'Hao nhiên liệu / km (đơn vị theo quy ước nội bộ)',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'fuel_rate_per_km phải là số dương' },
  )
  @IsPositive({ message: 'fuel_rate_per_km phải là số dương' })
  fuelRatePerKm: number;

  @ApiPropertyOptional({
    enum: VEHICLE_STATUSES,
    default: 'available',
    description: 'Trạng thái xe',
  })
  @IsOptional()
  @IsEnum(VEHICLE_STATUSES, { message: 'status không hợp lệ' })
  status?: VehicleStatusValue;
}
