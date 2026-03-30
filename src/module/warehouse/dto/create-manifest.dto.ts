import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateManifestDto {
  @ApiProperty({
    description: 'Danh sách ID đơn hàng (UUID) đã duyệt, cùng kho trung tâm',
    type: [String],
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds: string[];

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional({ example: '51H-12345' })
  @IsOptional()
  @IsString()
  vehiclePlate?: string;
}
