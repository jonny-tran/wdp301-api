import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import {
  FinalizeShipmentDto,
  PickItemDto,
  // ResetTaskDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { WarehouseService } from './warehouse.service';
// Import các Guards...

@ApiTags('Quản lý Kho vận (Warehouse Operations)')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // 1. Task: Danh sách đơn cần soạn
  @Get('picking-tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '1. Get list of Picking Tasks (Approved Orders)' })
  @ApiQuery({ name: 'date', required: false })
  async getPickingTasks(@Query('date') date?: string) {
    return this.warehouseService.getTasks(1, date); // Hardcode warehouseId=1
  }

  // 2. Picking: Chi tiết danh sách soạn hàng
  @Get('picking-tasks/:orderId')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '2. Get Picking List details (FEFO Suggestion)' })
  async getPickingList(@Param('orderId') orderId: string) {
    return this.warehouseService.getPickingList(orderId);
  }

  // 3. Picking: Xác nhận quét mã Lô (Validate)
  @Post('pick-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '3. Verify scanned Batch Code (FEFO Enforcement)' })
  async pickItem(@Body() dto: PickItemDto) {
    return this.warehouseService.validatePickItem(1, dto);
  }

  // 4. Picking: Làm lại lượt soạn hàng
  @Patch('picking-tasks/:orderId/reset')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '4. Reset picking status for an order' })
  async resetPickingTask(@Param('orderId') orderId: string) {
    // return this.warehouseService.resetPickingTask(orderId, 1, dto.reason);
    return this.warehouseService.resetPickingTask(orderId);
  }

  // 5. Shipment: Tạo phiếu giao hàng (Finalize)
  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '5. Finalize Shipment & Deduct Stock' })
  async createShipment(@Body() dto: FinalizeShipmentDto) {
    return this.warehouseService.finalizeShipment(1, dto);
  }

  // 6. Shipment: In phiếu giao hàng
  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '6. Get Shipment Invoice/Label data' })
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  // 7. Inventory: Kiểm tra thông tin Lô (Scan Check)
  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: '7. Quick check Batch Info by QR Code' })
  @ApiQuery({ name: 'batch_code', required: true })
  async scanCheck(@Query('batch_code') batchCode: string) {
    return this.warehouseService.scanBatchCheck(1, batchCode);
  }

  // (Giữ lại API Report Issue nếu cần thiết cho quy trình xử lý lỗi)
  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  async reportIssue(@Body() dto: ReportIssueDto) {
    return this.warehouseService.reportIssue(1, dto);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo kho mới (Ví dụ: Kho lạnh, Kho khô)' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách kho (có thể lọc theo storeId)' })
  async findAll(@Query('storeId') storeId?: string) {
    return this.warehouseService.findAll({ storeId });
  }

  @Get(':id/inventory')
  @Roles(UserRole.MANAGER, UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem tồn kho chi tiết của kho' })
  async getInventory(@Param('id') id: string) {
    return this.warehouseService.findInventory(+id);
  }
}
