import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { OrderStatus } from './constants/order-status.enum';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { OrderService } from './order.service';

@ApiTags('Order')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('catalog')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm [Franchise Staff]' })
  async getCatalog() {
    return this.orderService.getCatalog();
  }

  @Post()
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({ summary: 'Tạo đơn hàng [Franchise Staff]' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async createOrder(
    @CurrentUser() user: IJwtPayload,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user, createOrderDto);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Lấy danh sách đơn hàng của kho hàng của mình [Franchise Staff]',
  })
  async getMyStoreOrders(@CurrentUser() user: IJwtPayload) {
    return this.orderService.getMyStoreOrders(user);
  }

  @Get('coordinator')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({
    summary: 'Lấy danh sách đơn hàng chờ duyệt [Supply Coordinator]',
  })
  async getCoordinatorOrders(@Query('status') status?: OrderStatus) {
    return this.orderService.getCoordinatorOrders(status);
  }

  @Get('coordinator/:id/review')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({
    summary: 'Xem đơn & So sánh kho [Supply Coordinator]',
  })
  async reviewOrder(@Param('id') id: string) {
    return this.orderService.reviewOrder(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({ summary: 'Duyệt đơn hàng [Supply Coordinator]' })
  async approveOrder(
    @Param('id') id: string,
    @Body() approveDto: ApproveOrderDto,
  ) {
    return this.orderService.approveOrder(id, approveDto.force_approve);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({ summary: 'Từ chối đơn hàng [Supply Coordinator]' })
  async rejectOrder(
    @Param('id') id: string,
    @Body() rejectOrderDto: RejectOrderDto,
  ) {
    return this.orderService.rejectOrder(id, rejectOrderDto.reason);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({ summary: 'Hủy đơn hàng [Franchise Staff]' })
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    return this.orderService.cancelOrder(id, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Lấy thông tin đơn hàng [Supply Coordinator, Franchise Staff]',
  })
  async getOrderDetails(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.orderService.getOrderDetails(id, user);
  }
}
