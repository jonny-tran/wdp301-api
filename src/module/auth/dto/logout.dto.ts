import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh Token cần hủy (revoke)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh Token không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim())
  refreshToken: string;
}
