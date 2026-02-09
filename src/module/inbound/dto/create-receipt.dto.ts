import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
// tạo phiếu nháp (chứa thông tin chung như Nhà cung cấp, Ghi chú).
export class CreateReceiptDto {
  @ApiProperty({ description: 'ID nhà cung cấp', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  supplierId: number;

  @ApiProperty({
    description: 'Ghi chú nhập hàng',
    example: 'Nhập hàng tươi sống ngày 20/01',
    required: false,
  })
  @IsString()
  @IsOptional()
  note?: string;
}
