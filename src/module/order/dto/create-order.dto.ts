import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';

export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!value) return false;
          if (
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            !(value instanceof Date)
          )
            return false;

          const deliveryDate = new Date(value);
          const now = new Date();

          // Reset time part of deliveryDate to compare dates only
          const deliveryDateOnly = new Date(deliveryDate);
          deliveryDateOnly.setHours(0, 0, 0, 0);

          const todayOnly = new Date(now);
          todayOnly.setHours(0, 0, 0, 0);

          if (deliveryDateOnly <= todayOnly) {
            return false;
          }

          return true;
        },
        defaultMessage() {
          return 'Ngày giao hàng phải lớn hơn ngày hiện tại (theo ngày, bỏ qua giờ).';
        },
      },
    });
  };
}

export class OrderItemDto {
  @ApiProperty({ example: 1, description: 'ID of the product' })
  @IsInt({ message: 'ID sản phẩm phải là số nguyên' })
  @IsPositive({ message: 'ID sản phẩm phải là số dương' })
  productId: number;

  @ApiProperty({ example: 10, description: 'Quantity requested' })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @IsPositive({ message: 'Số lượng phải là số dương' })
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    example: '2023-12-25T00:00:00.000Z',
    description: 'Desired delivery date (must be in future)',
  })
  @IsDateString({}, { message: 'Ngày giao hàng không hợp lệ' })
  @IsNotEmpty({ message: 'Ngày giao hàng không được để trống' })
  @IsFutureDate()
  deliveryDate: string;

  @ApiProperty({ type: [OrderItemDto], description: 'List of items to order' })
  @IsArray({ message: 'Danh sách sản phẩm phải là một danh sách' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({
    description:
      'Bắt buộc với mặt hàng giá trị cao: thời điểm kiểm kê gần nhất (ISO 8601)',
    example: '2026-03-24T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'lastInventoryCheckTimestamp không hợp lệ' })
  lastInventoryCheckTimestamp?: string;
}
