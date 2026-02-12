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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FinalizeBulkShipmentDto } from './dto/finalize-bulk-shipment.dto';

import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

import { ReportIssueDto } from './dto/report-issue.dto';
import { ScanCheckDto } from './dto/scan-check.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Vận hành kho Trung tâm')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('picking-tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Lấy danh sách tác vụ soạn hàng (Phân trang) [Kitchen]',
    description: 'Trả về danh sách các đơn hàng đang ở trạng thái APPROVED',
  })
  @ResponseMessage('Lấy danh sách tác vụ soạn hàng thành công')
  async getPickingTasks(@Query() query: GetPickingTasksDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.getTasks(warehouseId, query);
  }

  @Get('picking-tasks/:id')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Xem chi tiết danh sách mặt hàng và lô hàng gợi ý cần soạn [Kitchen]',
    description:
      'Dựa trên quy tắc FEFO, hệ thống sẽ gợi ý các lô hàng (Batch) cần lấy cho đơn hàng này.',
  })
  @ResponseMessage('Lấy chi tiết danh sách soạn hàng thành công')
  async getPickingList(@Param('id') id: string) {
    return this.warehouseService.getPickingList(id);
  }

  @Patch('picking-tasks/:orderId/reset')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Hủy kết quả soạn hàng hiện tại và làm lại từ đầu [Kitchen]',
    description:
      'Dùng khi nhân viên kho chọn nhầm lô quá nhiều hoặc muốn reset lại tiến độ soạn hàng.',
  })
  @ResponseMessage('Làm lại lượt soạn hàng thành công')
  async resetPickingTask(@Param('orderId') orderId: string) {
    return this.warehouseService.resetPickingTask(orderId);
  }

  @Patch('shipments/finalize-bulk')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Duyệt & Xuất kho đơn hàng [Kitchen]',
    description:
      'Có thể gom nhiều đơn hàng vào một chuyến xe, trừ kho và cập nhật trạng thái DELIVERING đồng loạt. Hỗ trợ Transaction an toàn.',
  })
  @ResponseMessage('Duyệt & Xuất kho đơn hàng thành công')
  async finalizeBulkShipment(@Body() dto: FinalizeBulkShipmentDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.finalizeBulkShipment(warehouseId, dto);
  }

  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Lấy dữ liệu in phiếu giao hàng [Kitchen]',
    description:
      'Trả về thông tin để Frontend hiển thị form in phiếu giao hàng trước khi xe lăn bánh.',
  })
  @ResponseMessage('Lấy dữ liệu in phiếu giao hàng thành công')
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Kiểm tra nhanh thông tin lô hàng [Kitchen]',
    description:
      'Quét mã lô để xem tên sản phẩm, hạn sử dụng và số lượng còn lại trong kho.',
  })
  @ResponseMessage('Kiểm tra thông tin lô hàng thành công')
  async scanCheck(@Query() query: ScanCheckDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.scanBatchCheck(warehouseId, query.batchCode);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Báo cáo sự cố mặt hàng (Thiếu/Hỏng) [Kitchen]',
    description:
      'Khi phát hiện lô hàng bị hỏng, hệ thống sẽ tự động tìm lô khác cùng loại để bù vào đơn.',
  })
  @ResponseMessage('Báo cáo sự cố thành công')
  async reportIssue(@Body() dto: ReportIssueDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.reportIssue(warehouseId, dto);
  }
}
