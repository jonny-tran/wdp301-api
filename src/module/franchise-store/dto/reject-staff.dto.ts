import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectStaffDto {
  @ApiPropertyOptional({
    description: 'Lý do từ chối (hiển thị cho Manager khi xem danh sách)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
