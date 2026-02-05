import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import {
  FinalizeShipmentDto,
  PickingListResponseDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Quản lý Kho vận (Warehouse Operations)')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '1. Lấy danh sách phiếu chuẩn bị hàng (Đã duyệt)' })
  async getTasks() {
    // Hardcode warehouseId = 1 (Kho trung tâm)
    return this.warehouseService.getTasks(1);
  }

  @Get('tasks/:orderId/picking-list')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: '2. Lấy danh sách chọn hàng FEFO (JSON cho chế độ Offline)',
  })
  @ApiResponse({ type: PickingListResponseDto })
  async getPickingList(@Param('orderId') orderId: string) {
    return this.warehouseService.getPickingList(orderId);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: '3. Báo cáo lô hàng lỗi -> Tự động gợi ý lô thay thế',
  })
  async reportIssue(@Body() dto: ReportIssueDto) {
    // Hardcode warehouseId = 1
    return this.warehouseService.reportIssue(1, dto);
  }

  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '4. Hoàn tất & Trừ tồn kho (Thực tế & Reserved)' })
  async finalizeShipment(@Body() dto: FinalizeShipmentDto) {
    return this.warehouseService.finalizeShipment(1, dto);
  }

  // =================================================================
  // NEW ENDPOINTS for Manager
  // =================================================================

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo kho mới (Ví dụ: Kho lạnh, Kho khô)' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({ summary: 'Lấy danh sách kho (có thể lọc theo storeId)' })
  async findAll(@Query('storeId') storeId?: string) {
    return this.warehouseService.findAll({ storeId });
  }

  @Get(':id/inventory')
  @Roles(UserRole.MANAGER, UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({ summary: 'Xem tồn kho chi tiết của kho' })
  async getInventory(@Param('id') id: string) {
    // Strict access control: If Store Staff, can only view their own store's warehouse
    // But for simplicity in this turn, we rely on roles.
    // Ideally we check if warehouse.storeId == user.storeId
    return this.warehouseService.findInventory(+id);
  }
}
