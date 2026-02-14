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
import { ApproveOrderDto } from './dto/approve-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetCatalogDto } from './dto/get-catalog.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { OrderService } from './order.service';
import {
  FulfillmentRateQueryDto,
  SlaQueryDto,
} from './dto/analytics-query.dto';

@ApiTags('Order')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Lấy danh sách đơn hàng (Phân trang & Lọc) [Manager, Supply Coordinator]',
  })
  async findAll(@Query() query: GetOrdersDto) {
    return this.orderService.findAll(query);
  }

  @Post()
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo đơn hàng [Franchise Staff]' })
  async createOrder(
    @CurrentUser() user: IJwtPayload,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user, createOrderDto);
  }

  @Get('catalog')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm [Franchise Staff]' })
  async getCatalog(@Query() query: GetCatalogDto) {
    query.isActive = true;
    return this.orderService.getCatalog(query);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh sách đơn hàng của kho hàng của mình [Franchise Staff]',
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
  @ApiOperation({ summary: 'Hủy đơn hàng [Franchise Staff]' })
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    return this.orderService.cancelOrder(id, user);
  }

  @Get('coordinator/:id/review')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xem đơn & So sánh kho [Supply Coordinator]',
  })
  async reviewOrder(@Param('id') id: string) {
    return this.orderService.reviewOrder(id);
  }

  @Patch('coordinator/:id/approve')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt đơn hàng [Supply Coordinator]' })
  async approveOrder(
    @Param('id') id: string,
    @Body() approveDto: ApproveOrderDto,
  ) {
    return this.orderService.approveOrder(id, approveDto.force_approve);
  }

  @Patch('coordinator/:id/reject')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Từ chối đơn hàng [Supply Coordinator]' })
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
      'Lấy thông tin đơn hàng [Supply Coordinator, Franchise Staff, Manager]',
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
    summary: 'Tỷ lệ đáp ứng đơn hàng - Fill Rate (Manager)',
    description:
      'Tính tỷ lệ % hàng được duyệt so với yêu cầu. Thống kê số lượng hụt và lý do hụt (No backorder logic).',
  })
  async getFulfillmentRate(@Query() query: FulfillmentRateQueryDto) {
    return this.orderService.getFulfillmentRate(query);
  }
  @Get('analytics/performance/lead-time')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Theo dõi thời gian vận hành - SLA (Manager)',
    description: 'Tính trung bình Review Time, Picking Time và Delivery Time',
  })
  async getFulfillmentSla(@Query() query: SlaQueryDto) {
    return this.orderService.getFulfillmentSla(query);
  }
}
