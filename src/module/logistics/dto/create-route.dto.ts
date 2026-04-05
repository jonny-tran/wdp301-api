import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateRouteDto {
  @ApiProperty({
    example: 'Tuyến TP.HCM — Biên Hòa',
    description: 'Tên tuyến / lộ trình',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên tuyến không được để trống' })
  routeName: string;

  @ApiProperty({ example: 32.5, description: 'Khoảng cách (km)' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'distance_km phải là số dương' },
  )
  @IsPositive({ message: 'distance_km phải là số dương' })
  distanceKm: number;

  @ApiProperty({ example: 2.5, description: 'Thời gian di chuyển ước tính (giờ)' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'estimated_hours phải là số dương' },
  )
  @IsPositive({ message: 'estimated_hours phải là số dương' })
  estimatedHours: number;

  @ApiProperty({
    example: 350000,
    description: 'Chi phí vận chuyển cơ sở (VND)',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'base_transport_cost phải là số dương' },
  )
  @IsPositive({ message: 'base_transport_cost phải là số dương' })
  baseTransportCost: number;
}
