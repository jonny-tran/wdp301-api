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
import type { IJwtPayload, RequestWithUser } from '../auth/types/auth.types';
import { ClaimService } from './claim.service';
import { ClaimSummaryQueryDto } from './dto/analytics-query.dto';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { GetClaimsDto } from './dto/get-claims.dto';
import { ResolveClaimDto } from './dto/resolve-claim.dto';

@ApiTags('Claims')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('claims')
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Post()
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo khiếu nại thủ công [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Ghi nhận khiếu nại từ cửa hàng (thiếu/hỏng sau nhận hàng); hệ thống điều chỉnh tồn kho theo nghiệp vụ claim.',
  })
  @ResponseMessage('Tạo khiếu nại thành công. Tồn kho đã được điều chỉnh.')
  async createClaim(
    @Body() dto: CreateManualClaimDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    if (!user.storeId) {
      throw new BadRequestException('Tài khoản không có kho hàng');
    }
    return this.claimService.createManualClaim(dto, user.userId, user.storeId);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách khiếu nại (toàn hệ thống) [Admin, Manager, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator\n\n**Nghiệp vụ:** Liệt kê và lọc khiếu nại (`GetClaimsDto`) phục vụ xử lý tập trung; quyền xem theo logic service.',
  })
  async findAll(
    @Query() query: GetClaimsDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.claimService.getClaims(query, user);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Danh sách khiếu nại của cửa hàng (JWT) [Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Franchise Store Staff\n\n**Nghiệp vụ:** Tự gán `storeId` từ JWT; chỉ khiếu nại của cửa hàng đăng nhập.',
  })
  async getMyStoreClaims(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: GetClaimsDto,
  ) {
    if (!user.storeId) {
      throw new BadRequestException('Tài khoản không có cửa hàng');
    }
    query.storeId = user.storeId;
    return this.claimService.findAll(query);
  }

  @Get('analytics/summary')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Thống kê sai lệch & hư hỏng giao hàng (Claims) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Damage rate, missing rate và bottleneck sản phẩm dễ hỏng/thiếu khi vận chuyển (`ClaimSummaryQueryDto`).',
  })
  async getClaimSummary(@Query() query: ClaimSummaryQueryDto) {
    return this.claimService.getClaimSummary(query);
  }

  @Get(':id')
  @Roles(
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Chi tiết một khiếu nại [Admin, Manager, Supply Coordinator, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator, Franchise Store Staff\n\n**Nghiệp vụ:** Xem chi tiết claim; quyền xem cụ thể được kiểm soát trong service (cửa hàng chỉ claim của mình).',
  })
  async getClaimDetail(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.claimService.getClaimDetail(id, user);
  }

  @Patch(':id/resolve')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xử lý / đóng khiếu nại [Admin, Manager, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator\n\n**Nghiệp vụ:** Cập nhật trạng thái xử lý khiếu nại (`ResolveClaimDto`) — bồi thường, từ chối hoặc hướng xử lý theo quy trình.',
  })
  async resolveClaim(@Param('id') id: string, @Body() dto: ResolveClaimDto) {
    return this.claimService.resolveClaim(id, dto);
  }
}
