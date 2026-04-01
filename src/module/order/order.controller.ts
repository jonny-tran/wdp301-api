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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import {
  FulfillmentRateQueryDto,
  SlaQueryDto,
} from './dto/analytics-query.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { ProductionConfirmDto } from './dto/production-confirm.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { OrderService } from './order.service';

@ApiTags('Order')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Roles(
    UserRole.MANAGER,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.ADMIN,
    UserRole.FRANCHISE_STORE_STAFF,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách đơn hàng (phân trang & lọc) [Admin, Manager, Supply Coordinator, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator, Franchise Store Staff\n\n**Nghiệp vụ:** Trả về danh sách đơn hàng có phân trang và bộ lọc (`GetOrdersDto`) phục vụ giám sát và điều phối; nhân viên cửa hàng thường dùng kèm `storeId` hoặc endpoint `my-store` cho phạm vi cửa hàng.',
  })
  async findAll(@Query() query: GetOrdersDto) {
    return this.orderService.findAll(query);
  }

  @Post()
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo đơn hàng [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Tạo đơn với snapshot giá, đơn vị và quy cách đóng gói; kiểm tra lead time, dung lượng kho cửa hàng, nợ chứng từ (shipment in_transit quá hạn) và gộp nhóm consolidation khi cùng cửa hàng, ngày giao và ngày đặt.',
  })
  async createOrder(
    @CurrentUser() user: IJwtPayload,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user, createOrderDto);
  }

  @Get('catalog')
  @Roles(
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.ADMIN,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách sản phẩm (catalog đặt hàng) [Admin, Manager, Supply Coordinator, Kitchen, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator, Central Kitchen Staff, Franchise Store Staff\n\n**Nghiệp vụ:** Chỉ `finished_good` và `resell_product` (ẩn `raw_material`). Luôn `isActive = true`. Phân trang: `page`, `limit` (mặc định limit=20). Response: `items` + `meta` (totalItems, totalPages, currentPage, …).',
  })
  async getCatalog(@Query() query: GetCatalogDto) {
    query.isActive = true;
    return this.orderService.getCatalog(query);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh sách đơn hàng của cửa hàng (JWT) [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Gán `storeId` từ JWT rồi gọi cùng luồng lọc/phân trang như danh sách đơn — chỉ đơn thuộc cửa hàng đăng nhập.',
  })
  async getMyStoreOrders(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetOrdersDto,
  ) {
    query.storeId = user.storeId?.toString().trim();
    return this.orderService.findAll(query);
  }

  @Patch('franchise/:id/cancel')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Hủy đơn hàng (cửa hàng) [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Hủy đơn ở trạng thái `pending` thuộc đúng cửa hàng; đơn đã duyệt hoặc đang vận hành không dùng endpoint này (dùng hủy bắt buộc phía điều phối nếu có).',
  })
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    return this.orderService.cancelOrder(id, user);
  }

  @Get('coordinator/:id/review')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xem đơn và so sánh tồn kho trung tâm [Admin, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Supply Coordinator\n\n**Nghiệp vụ:** Trả về từng dòng hàng kèm tồn khả dụng tại kho trung tâm (FEFO batches, trừ phần đã reserve) để điều phối đánh giá trước khi duyệt.',
  })
  async reviewOrder(@Param('id') id: string) {
    return this.orderService.reviewOrder(id);
  }

  @Patch('coordinator/:id/approve')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Duyệt đơn hàng [Admin, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Supply Coordinator\n\n**Nghiệp vụ:** Khóa và phân bổ tồn theo FEFO, cập nhật số lượng duyệt từng dòng — hỗ trợ **Partial Fulfillment** (không backorder). Có thể bắt buộc `force_approve` khi tỷ lệ đáp ứng thấp, `price_acknowledged` khi lệch giá so với snapshot >20%, và `production_confirm` khi thiếu hàng cần phối hợp bếp.',
  })
  async approveOrder(
    @Param('id') id: string,
    @Body() approveDto: ApproveOrderDto,
  ) {
    return this.orderService.approveOrder(id, approveDto.force_approve, {
      price_acknowledged: approveDto.price_acknowledged,
      production_confirm: approveDto.production_confirm,
    });
  }

  @Patch('coordinator/:id/force-cancel')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Hủy bắt buộc (điều phối / quản lý) [Admin, Manager, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator\n\n**Nghiệp vụ:** Áp dụng cho đơn đã duyệt / đang soạn (không phải `pending`): giải phóng reserve và hủy shipment liên quan, ghi nhận đơn `cancelled` và tạo **nhiệm vụ hoàn kho (restock task)** để xử lý hàng đã giữ chỗ.',
  })
  async forceCancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.orderService.forceCancelOrder(id, user);
  }

  @Patch('franchise/:id/confirm-price')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cửa hàng xác nhận đồng ý giá (gỡ khóa lệch giá) [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Khi đơn bị khóa do chênh lệch giá catalog so với snapshot vượt ngưỡng (>20%), cửa hàng xác nhận đồng ý giá mới để tiếp tục luồng duyệt (xử lý **price discrepancy** / `pending_price_confirm`).',
  })
  async confirmPrice(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    return this.orderService.confirmStorePriceAcknowledgment(id, user);
  }

  @Patch('kitchen/:id/production-confirm')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bếp xác nhận làm bù hoặc từ chối (thiếu hàng) [Admin, Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Admin, Central Kitchen Staff\n\n**Nghiệp vụ:** Phản hồi khi đơn yêu cầu xác nhận sản xuất (`requires_production_confirm`): bếp chấp nhận làm bù phần thiếu hoặc từ chối nếu không phối hợp sản xuất được, để điều phối tiếp tục duyệt/giao hàng.',
  })
  async kitchenProductionConfirm(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
    @Body() dto: ProductionConfirmDto,
  ) {
    return this.orderService.kitchenProductionConfirm(id, user, dto);
  }

  @Patch('coordinator/:id/reject')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Từ chối đơn hàng [Admin, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Supply Coordinator\n\n**Nghiệp vụ:** Từ chối đơn ở trạng thái chờ xử lý kèm lý do (`RejectOrderDto`); không giải phóng hàng đã xuất vì đơn chưa đi qua bước duyệt giao.',
  })
  async rejectOrder(
    @Param('id') id: string,
    @Body() rejectOrderDto: RejectOrderDto,
  ) {
    return this.orderService.rejectOrder(id, rejectOrderDto.reason);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Lấy chi tiết đơn hàng theo ID [Admin, Manager, Supply Coordinator, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator, Franchise Store Staff\n\n**Nghiệp vụ:** Trả về thông tin đơn; Coordinator và Manager xem mọi đơn, Franchise Staff chỉ xem đơn của cửa hàng mình (so khớp `storeId` trên JWT).',
  })
  async getOrderDetails(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.orderService.getOrderDetails(id, user);
  }

  @Get('analytics/fulfillment-rate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tỷ lệ đáp ứng đơn hàng (Fill Rate) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Thống kê tỷ lệ % số lượng được duyệt so với yêu cầu, phân tích hụt hàng và lý do — phản ánh chính sách **không backorder** (chỉ giao phần duyệt được).',
  })
  async getFulfillmentRate(@Query() query: FulfillmentRateQueryDto) {
    return this.orderService.getFulfillmentRate(query);
  }
  @Get('analytics/performance/lead-time')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Theo dõi SLA vận hành (lead time) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Tổng hợp thời gian trung bình các khâu: duyệt đơn (review), soạn hàng (picking) và giao hàng (delivery) để đo mức độ đáp ứng SLA.',
  })
  async getFulfillmentSla(@Query() query: SlaQueryDto) {
    return this.orderService.getFulfillmentSla(query);
  }
}
