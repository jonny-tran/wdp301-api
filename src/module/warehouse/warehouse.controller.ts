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

@ApiTags('Warehouse Operations')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('picking-tasks')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Lấy danh sách các đơn hàng đã duyệt để bắt đầu soạn hàng [Kitchen]',
    description: 'Trả về danh sách các đơn hàng đang ở trạng thái APPROVED',
  })
  @ApiQuery({ name: 'date', required: false })
  @ResponseMessage('Lấy danh sách đơn cần soạn thành công')
  async getPickingTasks(@Query('date') date?: string) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.getTasks(warehouseId, date);
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

  @Post('pick-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xác nhận đã lấy đúng lô hàng bằng cách quét mã QR [Kitchen]',
    description:
      'Kiểm tra chéo mã lô quét được với danh sách gợi ý và cập nhật hàng vào khu vực chờ giao.',
  })
  @ResponseMessage('Xác nhận quét mã Lô thành công')
  async pickItem(@Body() dto: PickItemDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.validatePickItem(warehouseId, dto);
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

  @Post('shipments')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Chốt danh sách đã soạn và chính thức tạo phiếu xuất kho [Kitchen]',
    description:
      'Chuyển trạng thái đơn hàng sang DELIVERING và trừ tồn kho vật lý.',
  })
  @ResponseMessage('Tạo phiếu giao hàng thành công')
  async createShipment(@Body() dto: FinalizeShipmentDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.finalizeShipment(warehouseId, dto);
  }

  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Lấy dữ liệu in Phiếu Giao Hàng (Delivery Note) [Kitchen]',
    description:
      'Trả về thông tin để Frontend hiển thị form in ấn dán lên thùng hàng trước khi xe lăn bánh.',
  })
  @ResponseMessage('In phiếu giao hàng thành công')
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Kiểm tra nhanh thông tin bất kỳ lô hàng nào qua mã QR [Kitchen]',
    description:
      'Quét mã lô để xem tên sản phẩm, hạn sử dụng và số lượng còn lại trong kho.',
  })
  @ApiQuery({ name: 'batchCode', required: true })
  @ResponseMessage('Quick check Batch Info by QR Code thành công')
  async scanCheck(@Query('batchCode') batchCode: string) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.scanBatchCheck(warehouseId, batchCode);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Báo cáo hàng hỏng trong khi soạn và yêu cầu lô thay thế [Kitchen]',
    description:
      'Khi phát hiện lô hàng bị hỏng, hệ thống sẽ tự động tìm lô khác cùng loại để bù vào đơn.',
  })
  @ResponseMessage('Báo cáo lô hàng bị hỏng thành công')
  async reportIssue(@Body() dto: ReportIssueDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.reportIssue(warehouseId, dto);
  }
}
