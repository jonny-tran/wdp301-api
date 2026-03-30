import { BadRequestException } from '@nestjs/common';

export class InsufficientStockException extends BadRequestException {
  constructor(
    message = 'Không đủ tồn kho khả dụng cho thao tác này. Kiểm tra tồn theo lô (FEFO), phần đã giữ chỗ (reserved) và định mức nhu cầu.',
  ) {
    super(message);
  }
}
