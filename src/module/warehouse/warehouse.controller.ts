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
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
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

  @Get('picking-tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Danh sách đơn cần soạn [Kitchen]' })
  @ApiQuery({ name: 'date', required: false })
  @ResponseMessage('Lấy danh sách đơn cần soạn thành công')
  async getPickingTasks(@Query('date') date?: string) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.getTasks(warehouseId, date);
  }

  @Get('picking-tasks/:orderId')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Chi tiết danh sách soạn hàng [Kitchen]' })
  @ResponseMessage('Lấy chi tiết danh sách soạn hàng thành công')
  async getPickingList(@Param('orderId') orderId: string) {
    return this.warehouseService.getPickingList(orderId);
  }

  @Post('pick-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Xác nhận quét mã Lô [Kitchen]' })
  @ResponseMessage('Xác nhận quét mã Lô thành công')
  async pickItem(@Body() dto: PickItemDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.validatePickItem(warehouseId, dto);
  }

  @Patch('picking-tasks/:orderId/reset')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Làm lại lượt soạn hàng [Kitchen]' })
  @ResponseMessage('Làm lại lượt soạn hàng thành công')
  async resetPickingTask(@Param('orderId') orderId: string) {
    return this.warehouseService.resetPickingTask(orderId);
  }

  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Tạo phiếu giao hàng [Kitchen]' })
  @ResponseMessage('Tạo phiếu giao hàng thành công')
  async createShipment(@Body() dto: FinalizeShipmentDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.finalizeShipment(warehouseId, dto);
  }

  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'In phiếu giao hàng [Kitchen]' })
  @ResponseMessage('In phiếu giao hàng thành công')
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Kiểm tra thông tin Lô [Kitchen]' })
  @ApiQuery({ name: 'batch_code', required: true })
  @ResponseMessage('Kiểm tra thông tin Lô thành công')
  async scanCheck(@Query('batch_code') batchCode: string) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.scanBatchCheck(warehouseId, batchCode);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Báo cáo lô hàng bị hỏng [Kitchen]' })
  @ResponseMessage('Báo cáo lô hàng bị hỏng thành công')
  async reportIssue(@Body() dto: ReportIssueDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.reportIssue(warehouseId, dto);
  }
}
