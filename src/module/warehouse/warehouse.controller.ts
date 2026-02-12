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
import { FinalizeShipmentDto } from './dto/finalize-shipment.dto';
import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';
import { PickItemDto } from './dto/pick-item.dto';
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

  @Post('pick-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xác nhận soạn mặt hàng (Quét mã vạch/Lô) [Kitchen]',
    description:
      'Kiểm tra chéo mã lô quét được với danh sách gợi ý và cập nhật hàng vào khu vực chờ giao.',
  })
  @ResponseMessage('Xác nhận soạn mặt hàng thành công')
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
    summary: 'Hoàn tất soạn hàng & Xuất kho [Kitchen]',
    description:
      'Chuyển trạng thái đơn hàng sang DELIVERING và trừ tồn kho vật lý.',
  })
  @ResponseMessage('Hoàn tất soạn hàng và xuất kho thành công')
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
