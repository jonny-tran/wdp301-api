import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ClaimStatus } from '../constants/claim-status.enum';

export class ResolveClaimDto {
  @ApiProperty({ enum: [ClaimStatus.APPROVED, ClaimStatus.REJECTED] })
  @IsEnum([ClaimStatus.APPROVED, ClaimStatus.REJECTED], {
    message: 'Status must be approved or rejected',
  })
  status: ClaimStatus.APPROVED | ClaimStatus.REJECTED;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  resolutionNote?: string;
}
