import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { GetShipmentsDto } from './dto/get-shipments.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh sách lô hàng [Manager, Coordinator, Admin]',
  })
  @ResponseMessage('Lấy danh sách lô hàng thành công')
  async findAll(@Query() query: GetShipmentsDto) {
    return this.shipmentService.findAll(query);
  }

  @Get('store/my')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Lấy danh sách lô hàng của cửa hàng [Franchise Staff]',
  })
  @ResponseMessage('Lấy danh sách lô hàng thành công')
  async getMyStoreShipments(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetShipmentsDto,
  ) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    // Force storeId filter
    query.storeId = user.storeId;
    return this.shipmentService.findAll(query);
  }

  @Get(':id/picking-list')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Lấy danh sách nhặt hàng (Picking List) [Coordinator, Kitchen]',
  })
  @ResponseMessage('Lấy danh sách nhặt hàng thành công')
  async getPickingList(@Param('id') id: string) {
    return this.shipmentService.getPickingList(id);
  }

  @Get(':id')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết lô hàng [Franchise Staff]',
  })
  async getShipmentDetail(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId && user.role !== (UserRole.ADMIN as any)) {
      // Admin might not have storeId, but service checks ownership based on storeId logic.
      // If Admin, pass undefined? Service logic: "if (!warehouse || warehouse.storeId !== storeId)".
      // Service expects a storeId to validate content.
      // If Admin views, maybe bypass validation or pass targeted storeId?
      // Current logic requires storeId.
      // For now, I'll keep existing logic: User must has storeId check in Controller, OR Service needs update.
      // Existing logic threw error if !user.storeId.
      // Ideally Admin can view any?
      // Given prompt "Refactor Controller... Endpoint 2... Role: Franchise Store Staff".
      // Detail endpoint logic was not explicitly requested to change for Admin.
      // I'll stick to existing logic for detail.
      // But for "getMyStoreShipments", it forces `query.storeId`.
      // For detail, I'll keep as is.
      throw new BadRequestException('User không có storeId');
    }
    // Note: If Admin accesses this, they might fail if they don't have storeId.
    // I will allow Admin to pass if user.role is admin, but service needs update to allow admin.
    // I will just keep logic safe: ensure storeId exists.
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.getShipmentDetail(id, user.storeId);
  }

  @Post(':id/receive')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xác nhận nhận hàng [Franchise Staff]',
  })
  async receiveShipment(
    @Param('id') id: string,
    @Body() dto: ReceiveShipmentDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.receiveShipment(
      id,
      dto,
      user.sub,
      user.storeId,
    );
  }
}
