import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { ClaimService } from './claim.service';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { GetClaimsDto } from './dto/get-claims.dto';
import { ResolveClaimDto } from './dto/resolve-claim.dto';
import { ClaimSummaryQueryDto } from './dto/analytics-query.dto';

@ApiTags('Claims')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('claims')
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách khiếu nại [Manager, Coordinator, Admin]',
  })
  async findAll(@Query() query: GetClaimsDto) {
    return this.claimService.findAll(query);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Danh sách khiếu nại của cửa hàng [Store Staff]',
  })
  async getMyStoreClaims(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetClaimsDto,
  ) {
    if (user.storeId) {
      query.storeId = user.storeId;
    }
    return this.claimService.findAll(query);
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
  @ResponseMessage('Tạo khiếu nại thành công. Tồn kho đã được điều chỉnh.')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  async createClaim(
    @Body() dto: CreateManualClaimDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId) {
      throw new BadRequestException('Tài khoản không có kho hàng');
    }
    return this.claimService.createManualClaim(dto, user.sub, user.storeId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Xử lý khiếu nại [Coordinator, Manager]' })
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.MANAGER, UserRole.ADMIN)
  async resolveClaim(@Param('id') id: string, @Body() dto: ResolveClaimDto) {
    return this.claimService.resolveClaim(id, dto);
  }

  @Get('analytics/summary')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tỷ lệ sai lệch & hư hỏng giao hàng (Manager)',
    description:
      '1. Damage Rate. 2. Missing Rate. 3. Bottleneck: Tìm sản phẩm dễ hỏng/thiếu nhất khi vận chuyển.',
  })
  async getClaimSummary(@Query() query: ClaimSummaryQueryDto) {
    return this.claimService.getClaimSummary(query);
  }
}
