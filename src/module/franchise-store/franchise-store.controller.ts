import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DemandPatternQueryDto } from './dto/analytics-query.dto';
import { CreateStaffRequestsDto } from './dto/create-staff-request.dto';
import { RejectStaffDto } from './dto/reject-staff.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { FranchiseStoreService } from './franchise-store.service';

@ApiTags('Franchise Stores')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('stores')
export class FranchiseStoreController {
  constructor(private readonly franchiseStoreService: FranchiseStoreService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo store mới [Manager]' })
  async create(@Body() dto: CreateStoreDto) {
    return this.franchiseStoreService.createStore(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({
    summary: 'Lấy danh sách store [Admin, Manager, Coordinator]',
  })
  async findAll(@Query() filter: GetStoresFilterDto) {
    return this.franchiseStoreService.findAll(filter);
  }

  @Post('staff')
  @Roles(UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Manager gửi yêu cầu tạo nhân viên (PENDING) — staff[] có thể nhiều cửa hàng; mỗi dòng: storeId + fullName + phone; tối đa 50/request [Manager]',
  })
  createStaffRequests(@Body() dto: CreateStaffRequestsDto) {
    return this.franchiseStoreService.createStaffRequestsBatch(dto);
  }

  @Get('staff/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin xem danh sách nhân viên chờ duyệt [Admin]' })
  listPendingStaff() {
    return this.franchiseStoreService.findPendingStaffRequests();
  }

  @Patch('staff/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin duyệt — sinh email & mật khẩu mặc định, kích hoạt tài khoản [Admin]',
  })
  approveStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.franchiseStoreService.approveStaff(id);
  }

  @Patch('staff/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin từ chối yêu cầu — chuyển status rejected, có thể kèm lý do [Admin]',
  })
  rejectStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectStaffDto,
  ) {
    return this.franchiseStoreService.rejectStaff(id, dto);
  }

  @Get('analytics/reliability')
  @Roles(UserRole.MANAGER)
  @ApiOperation({
    summary: 'Đánh giá độ tin cậy của Cửa hàng & Phát hiện gian lận [Manager]',
  })
  async getStoreReliability() {
    return this.franchiseStoreService.getStoreReliability();
  }

  @Get('analytics/demand-pattern')
  @Roles(UserRole.MANAGER)
  @ApiOperation({
    summary: 'Phân tích xu hướng đặt hàng theo Thứ trong tuần [Manager]',
  })
  async getDemandPattern(@Query() query: DemandPatternQueryDto) {
    return this.franchiseStoreService.getDemandPattern(query);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Lấy chi tiết store [Manager]' })
  async findOne(@Param('id') id: string) {
    return this.franchiseStoreService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật store [Manager]' })
  async update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.franchiseStoreService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa Store [Manager]' })
  async remove(@Param('id') id: string) {
    return this.franchiseStoreService.remove(id);
  }
}
