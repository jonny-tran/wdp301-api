import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
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

          // Check if date is in the past or today
          if (deliveryDateOnly <= todayOnly) {
            return false;
          }

          // Cut-off time logic: If now is after 22:00, cannot order for tomorrow
          const tomorrow = new Date(todayOnly);
          tomorrow.setDate(tomorrow.getDate() + 1);

          if (deliveryDateOnly.getTime() === tomorrow.getTime()) {
            if (now.getHours() >= 22) {
              return false;
            }
          }

          return true;
        },
        defaultMessage() {
          const now = new Date();
          if (now.getHours() >= 22) {
            return 'Đơn hàng đặt sau 22:00 không thể giao vào ngày mai. Vui lòng chọn ngày giao hàng khác.';
          }
          return 'Ngày giao hàng phải là ít nhất 1 ngày trong tương lai.';
        },
      },
    });
  };
}

export class OrderItemDto {
  @ApiProperty({ example: 1, description: 'ID of the product' })
  @IsInt({ message: 'ID sản phẩm phải là số nguyên' })
  @IsPositive({ message: 'ID sản phẩm phải là số dương' })
  product_id: number;

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
  delivery_date: string;

  @ApiProperty({ type: [OrderItemDto], description: 'List of items to order' })
  @IsArray({ message: 'Danh sách sản phẩm phải là một danh sách' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
