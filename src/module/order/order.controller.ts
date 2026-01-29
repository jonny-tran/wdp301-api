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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { OrderStatus } from './constants/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { OrderService } from './order.service';
import {
  ApiApproveOrder,
  ApiCancelOrder,
  ApiCreateOrder,
  ApiGetCatalog,
  ApiGetCoordinatorOrders,
  ApiGetMyStoreOrders,
  ApiGetOrderDetails,
  ApiRejectOrder,
  ApiReviewOrder,
} from './order.swagger';

@ApiTags('Order')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('catalog')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiGetCatalog()
  async getCatalog() {
    return this.orderService.getCatalog();
  }

  @Post()
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiCreateOrder()
  @UsePipes(new ValidationPipe({ transform: true }))
  async createOrder(
    @CurrentUser() user: IJwtPayload,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user, createOrderDto);
  }

  @Get('my-store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiGetMyStoreOrders()
  async getMyStoreOrders(@CurrentUser() user: IJwtPayload) {
    return this.orderService.getMyStoreOrders(user);
  }

  @Get('coordinator')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiGetCoordinatorOrders()
  async getCoordinatorOrders(@Query('status') status?: OrderStatus) {
    return this.orderService.getCoordinatorOrders(status);
  }

  @Get('coordinator/:id/review')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiReviewOrder()
  async reviewOrder(@Param('id') id: string) {
    return this.orderService.reviewOrder(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiApproveOrder()
  async approveOrder(@Param('id') id: string) {
    return this.orderService.approveOrder(id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPPLY_COORDINATOR)
  @ApiRejectOrder()
  async rejectOrder(
    @Param('id') id: string,
    @Body() rejectOrderDto: RejectOrderDto,
  ) {
    return this.orderService.rejectOrder(id, rejectOrderDto.reason);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiCancelOrder()
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    return this.orderService.cancelOrder(id, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPPLY_COORDINATOR, UserRole.FRANCHISE_STORE_STAFF)
  @ApiGetOrderDetails()
  async getOrderDetails(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.orderService.getOrderDetails(id, user);
  }
}
