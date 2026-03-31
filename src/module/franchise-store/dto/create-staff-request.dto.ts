import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const STAFF_BATCH_MAX = 50;

export class CreateStaffRequestItemDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'ID cửa hàng franchise nhân viên sẽ thuộc về — mỗi dòng có thể khác nhau (Manager quản lý nhiều cửa hàng)',
  })
  @IsUUID('4')
  storeId: string;

  @ApiProperty({ example: 'Trần Thành Đạt', description: 'Họ và tên đầy đủ' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '0909123456' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\-\s()]{8,20}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone: string;

  @ApiPropertyOptional({
    example: 'Làm ca sáng',
    description: 'Ghi chú thêm cho Admin (tùy chọn)',
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return value;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateStaffRequestsDto {
  @ApiProperty({
    type: [CreateStaffRequestItemDto],
    description: `Danh sách nhân viên cần tạo (tối đa ${STAFF_BATCH_MAX} người / request)`,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất một nhân viên trong danh sách' })
  @ArrayMaxSize(STAFF_BATCH_MAX, {
    message: `Tối đa ${STAFF_BATCH_MAX} nhân viên mỗi lần gửi`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateStaffRequestItemDto)
  staff: CreateStaffRequestItemDto[];
}
