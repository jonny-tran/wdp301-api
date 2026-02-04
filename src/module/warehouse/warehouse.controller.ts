import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../module/auth/decorators/roles.decorator';
import { UserRole } from '../module/auth/dto/create-user.dto';
import { AtGuard } from '../module/auth/guards/auth.guard';
import { RolesGuard } from '../module/auth/guards/roles.guard';
import {
  FinalizeShipmentDto,
  PickingListResponseDto,
  ReportIssueDto,
} from './dto/warehouse-ops.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Warehouse Operations')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '1. Get list of approved orders to pick' })
  async getTasks() {
    // Hardcode warehouseId = 1 (Kho trung tâm)
    return this.warehouseService.getTasks(1);
  }

  @Get('tasks/:orderId/picking-list')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '2. Get FEFO Picking List (JSON for Offline Mode)' })
  @ApiResponse({ type: PickingListResponseDto })
  async getPickingList(@Param('orderId') orderId: string) {
    return this.warehouseService.getPickingList(orderId);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: '3. Handle Damaged Batch -> Auto suggest replacement',
  })
  async reportIssue(@Body() dto: ReportIssueDto) {
    // Hardcode warehouseId = 1
    return this.warehouseService.reportIssue(1, dto);
  }

  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: '4. Finalize & Deduct Stock (Physical & Reserved)' })
  async finalizeShipment(@Body() dto: FinalizeShipmentDto) {
    return this.warehouseService.finalizeShipment(1, dto);
  }
}
