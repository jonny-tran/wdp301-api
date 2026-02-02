import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { ClaimService } from './claim.service';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { ResolveClaimDto } from './dto/resolve-claim.dto';

@ApiTags('Claims')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('claims')
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách khiếu nại [Coordinator, Kitchen]',
  })
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.CENTRAL_KITCHEN_STAFF)
  async getClaims(@CurrentUser() user: IJwtPayload) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }
    return this.claimService.getClaimsByStore(user.storeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết khiếu nại' })
  @Roles(
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.CENTRAL_KITCHEN_STAFF,
  )
  async getClaimDetail(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.claimService.getClaimDetail(id, user.storeId!);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo khiếu nại thủ công' })
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  async createClaim(
    @Body() dto: CreateManualClaimDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }
    return this.claimService.createManualClaim(dto, user.sub, user.storeId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Xử lý khiếu nại [Coordinator, Manager]' })
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.MANAGER)
  async resolveClaim(@Param('id') id: string, @Body() dto: ResolveClaimDto) {
    return this.claimService.resolveClaim(id, dto);
  }
}
