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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { CancelPickingTaskDto } from './dto/cancel-picking-task.dto';
import { ConsolidateManifestDto } from './dto/consolidate-manifest.dto';
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
    summary: 'Lấy danh sách tác vụ soạn hàng (phân trang) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Liệt kê đơn cần soạn (`APPROVED` hoặc `PICKING`), phân trang/lọc (`GetPickingTasksDto`).',
  })
  @ResponseMessage('Lấy danh sách tác vụ soạn hàng thành công')
  async getPickingTasks(@Query() query: GetPickingTasksDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.getTasks(warehouseId, query);
  }

  @Get('picking-tasks/:id')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Chi tiết picking task — gợi ý lô theo FEFO [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Với một đơn đã duyệt, trả về từng mặt hàng và các lô (batch) gợi ý cần lấy theo quy tắc **FEFO** (ưu tiên hạn sử dụng gần nhất).',
  })
  @ResponseMessage('Lấy chi tiết danh sách soạn hàng thành công')
  async getPickingList(@Param('id') id: string) {
    return this.warehouseService.getPickingList(id);
  }

  @Post('tasks/:orderId/cancel')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Hủy task soạn hàng (approved / picking) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Hoàn chỗ reserve đã gắn đơn, hủy shipment preparing, đặt đơn `cancelled` và lưu `cancel_reason`. Không áp dụng khi đơn đang trong manifest `preparing` (cần hủy manifest trước).',
  })
  @ResponseMessage('Đã hủy task soạn hàng')
  async cancelPickingTask(
    @Param('orderId') orderId: string,
    @Body() dto: CancelPickingTaskDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.warehouseService.cancelPickingTask(
      orderId,
      user.sub,
      dto.reason,
    );
  }

  @Patch('picking-tasks/:orderId/reset')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Reset tiến độ soạn hàng cho đơn [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Xóa trạng thái soạn hiện tại của đơn để làm lại từ đầu khi quét nhầm lô hoặc cần phân bổ lại batch.',
  })
  @ResponseMessage('Làm lại lượt soạn hàng thành công')
  async resetPickingTask(@Param('orderId') orderId: string) {
    return this.warehouseService.resetPickingTask(orderId);
  }

  @Patch('shipments/finalize-bulk')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xuất kho gộp nhiều đơn (finalize bulk shipment) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Gom nhiều đơn vào một (hoặc nhiều) chuyến giao: trừ tồn/reserve, tạo/cập nhật shipment và chuyển trạng thái giao hàng — thực hiện trong **transaction** để đảm bảo nhất quán.',
  })
  @ResponseMessage('Duyệt & Xuất kho đơn hàng thành công')
  async finalizeBulkShipment(@Body() dto: FinalizeBulkShipmentDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.finalizeBulkShipment(warehouseId, dto);
  }

  @Get('shipments/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Dữ liệu in phiếu giao hàng [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Trả về payload hiển thị/in phiếu giao trước khi xe rời kho (địa chỉ, dòng hàng, khối lượng tóm tắt theo nghiệp vụ shipment).',
  })
  @ResponseMessage('Lấy dữ liệu in phiếu giao hàng thành công')
  async getShipmentLabel(@Param('id') id: string) {
    return this.warehouseService.getShipmentLabel(id);
  }

  @Get('scan-check')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Quét kiểm tra nhanh một lô (batch) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Theo `batchCode`, tra cứu sản phẩm, hạn dùng và số lượng khả dụng tại kho trung tâm khi soạn hàng.',
  })
  @ResponseMessage('Kiểm tra thông tin lô hàng thành công')
  async scanCheck(@Query() query: ScanCheckDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.scanBatchCheck(warehouseId, query.batchCode);
  }

  @Post('batch/report-issue')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Báo cáo sự cố lô (hỏng / thiếu khi soạn) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Ghi nhận lô không lấy được; hệ thống tìm lô thay thế cùng sản phẩm (theo **FEFO**) để bù vào đơn đang soạn.',
  })
  @ResponseMessage('Báo cáo sự cố thành công')
  async reportIssue(@Body() dto: ReportIssueDto) {
    const warehouseId = await this.warehouseService.getCentralWarehouseId();
    return this.warehouseService.reportIssue(warehouseId, dto);
  }

  @Post('manifest/consolidate')
  @Roles(
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary: 'Gom đơn vào manifest (route + tải trọng xe) [Điều phối / Quản lý]',
    description:
      'Kiểm tra đơn approved, chưa shipment_id, cùng route (store.route_id), tổng khối lượng theo quantity_approved × weight_kg không vượt payload xe; tạo manifest, shipment consolidated, gán orders.shipment_id và chuyển đơn sang picking.',
  })
  @ResponseMessage('Gom đơn vào manifest thành công')
  async consolidateManifest(@Body() dto: ConsolidateManifestDto) {
    return this.warehouseService.consolidateManifestOrders(dto);
  }

  @Post('manifests')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Tạo manifest (wave picking nhiều đơn) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Gom nhiều đơn vào một manifest một chuyến, sinh picking list **gộp theo sản phẩm** để giảm số lần đi lại trong kho (WH-OPTIMIZE).',
  })
  @ResponseMessage('Tạo manifest thành công')
  async createManifest(@Body() dto: CreateManifestDto) {
    return this.warehouseService.createManifest(dto);
  }

  @Get('manifests/:id/picking-list')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Picking list gộp theo manifest [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Trả về danh sách soạn hàng master theo `manifestId`: tổng nhu cầu theo SKU/lô cho toàn wave, phục vụ soạn một lượt trước khi xuất xe.',
  })
  @ResponseMessage('Lấy picking list manifest thành công')
  async getManifestPickingList(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.getManifestPickingList(id);
  }

  @Patch('manifests/:id/verify-item')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Quét xác nhận lô trên manifest (FEFO cứng) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Ghi nhận lô thực tế đã quét cho một dòng trên manifest; ràng buộc **FEFO cứng** — chỉ chấp nhận lô đúng thứ tự hạn dùng đã định.',
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
    summary: 'Báo hỏng lô trên manifest (đổi sang lô tiếp theo) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Khi lô được gợi ý không dùng được trên manifest, báo sự cố và chỉ định/chuyển sang lô kế tiếp đúng quy tắc FEFO.',
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
    summary: 'Xe rời kho — xuất kho theo toàn bộ manifest [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Xác nhận manifest đã soạn đủ; thực hiện **EXPORT** — trừ tồn theo toàn bộ dòng đã quét và chuyển trạng thái vận chuyển tương ứng.',
  })
  @ResponseMessage('Đã xác nhận xuất kho theo manifest')
  async confirmManifestDeparture(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.confirmManifestDeparture(id);
  }

  @Post('manifests/:id/cancel')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Hủy manifest trước khi xuất xe [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Hủy wave chưa xuất kho: **hoàn trả phần đã reserve** gắn với manifest và giải phóng đơn/lô khỏi trạng thái gom chuyến.',
  })
  @ResponseMessage('Đã hủy manifest')
  async cancelManifest(@Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.cancelManifest(id);
  }
}
