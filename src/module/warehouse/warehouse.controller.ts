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
import {
  FinalizeShipmentDto,
  PickItemDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Quản lý Kho vận (Warehouse Operations)')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // 1. Task: Danh sách đơn cần soạn
  @Get('picking-tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '1. Get list of Picking Tasks (Approved Orders)' })
  @ApiQuery({ name: 'date', required: false })
  async getPickingTasks(@Query('date') date?: string) {
    // Lấy warehouseId động (Central) thay vì hardcode
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.getTasks(warehouseId, date);
  }

  // 2. Picking: Chi tiết danh sách soạn hàng
  @Get('picking-tasks/:orderId')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '2. Get Picking List details (FEFO Suggestion)' })
  async getPickingList(@Param('orderId') orderId: string) {
    return this.warehouseService.getPickingList(orderId);
  }

  // 3. Picking: Xác nhận quét mã Lô (Validate)
  @Post('pick-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '3. Verify scanned Batch Code (FEFO Enforcement)' })
  async pickItem(@Body() dto: PickItemDto) {
    // Lấy warehouseId động (Central)
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.validatePickItem(warehouseId, dto);
  }

  // 4. Picking: Làm lại lượt soạn hàng
  @Patch('picking-tasks/:orderId/reset')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '4. Reset picking status for an order' })
  async resetPickingTask(@Param('orderId') orderId: string) {
    return this.warehouseService.resetPickingTask(orderId);
  }

  // 5. Shipment: Tạo phiếu giao hàng (Finalize)
  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '5. Finalize Shipment & Deduct Stock' })
  async createShipment(@Body() dto: FinalizeShipmentDto) {
    // Lấy warehouseId động (Central)
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.finalizeShipment(warehouseId, dto);
  }

  // 6. Shipment: In phiếu giao hàng
  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '6. Get Shipment Invoice/Label data' })
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  // 7. Inventory: Kiểm tra thông tin Lô (Scan Check)
  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '7. Quick check Batch Info by QR Code' })
  @ApiQuery({ name: 'batch_code', required: true })
  async scanCheck(@Query('batch_code') batchCode: string) {
    // Lấy warehouseId động (Central)
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.scanBatchCheck(warehouseId, batchCode);
  }

  // (Optional) Report Issue
  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Report damaged batch and suggest replacement' })
  async reportIssue(@Body() dto: ReportIssueDto) {
    // Lấy warehouseId động (Central)
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.reportIssue(warehouseId, dto);
  }
}
