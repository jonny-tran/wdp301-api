import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Refresh Token hiện tại (được cấp lúc Login hoặc lần Refresh trước)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh Token không được để trống' })
  @Transform(({ value }: { value: string }) => value?.trim())
  refreshToken: string;
}
