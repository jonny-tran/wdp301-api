import { BadRequestException } from '@nestjs/common';

export class InsufficientStockException extends BadRequestException {
  constructor(message = 'Không đủ tồn kho nguyên liệu') {
    super(message);
  }
}
