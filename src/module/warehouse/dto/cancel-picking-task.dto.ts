import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelPickingTaskDto {
  @ApiProperty({
    example: 'Thiếu hàng thực tế tại kệ — cần kiểm kê lại',
    description: 'Lý do nhân viên bếp hủy task soạn (ghi vào orders.cancel_reason)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Lý do cần ít nhất 3 ký tự' })
  @MaxLength(2000)
  reason!: string;
}
