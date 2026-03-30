import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateManifestDto } from './dto/create-manifest.dto';
import { FinalizeBulkShipmentDto } from './dto/finalize-bulk-shipment.dto';

import { GetPickingTasksDto } from './dto/get-picking-tasks.dto';

import { ReportIssueDto } from './dto/report-issue.dto';
import { ReportManifestBatchIssueDto } from './dto/report-manifest-batch-issue.dto';
import { VerifyManifestItemDto } from './dto/verify-manifest-item.dto';
import { ScanCheckDto } from './dto/scan-check.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Warehouse Operation')
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

  @Post('manifests')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Tạo manifest từ nhiều đơn (wave picking)',
    description:
      'Gom đơn vào một chuyến xe, sinh picking list gộp theo sản phẩm (WH-OPTIMIZE).',
  })
  @ResponseMessage('Tạo manifest thành công')
  async createManifest(@Body() dto: CreateManifestDto) {
    return this.warehouseService.createManifest(dto);
  }

  @Get('manifests/:id/picking-list')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Lấy master list soạn hàng gộp theo manifest',
  })
  @ResponseMessage('Lấy picking list manifest thành công')
  async getManifestPickingList(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.getManifestPickingList(id);
  }

  @Patch('manifests/:id/verify-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Quét xác nhận lô hàng (FEFO cứng)',
  })
  @ResponseMessage('Xác nhận quét lô thành công')
  async verifyManifestItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyManifestItemDto,
  ) {
    return this.warehouseService.verifyManifestItem(id, dto);
  }

  @Post('manifests/:id/report-batch-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Báo hỏng lô theo manifest (chỉ định lô tiếp theo)',
  })
  @ResponseMessage('Đã xử lý báo hỏng lô')
  async reportManifestBatchIssue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportManifestBatchIssueDto,
  ) {
    return this.warehouseService.reportManifestBatchIssue(id, dto);
  }

  @Post('manifests/:id/depart')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xe rời kho — trừ tồn kho (EXPORT) theo toàn bộ manifest',
  })
  @ResponseMessage('Đã xác nhận xuất kho theo manifest')
  async confirmManifestDeparture(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.confirmManifestDeparture(id);
  }

  @Post('manifests/:id/cancel')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Hủy manifest (hoàn reserved) trước khi xe rời kho',
  })
  @ResponseMessage('Đã hủy manifest')
  async cancelManifest(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.cancelManifest(id);
  }
}
