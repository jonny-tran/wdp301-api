import { ApiProperty } from '@nestjs/swagger';

export class ProductCatalogDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  sku: string;

  @ApiProperty()
  unit: string;
}

export class CreateOrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  store_id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  delivery_date: Date;

  @ApiProperty()
  created_at: Date;
}
