import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get(':id/picking-list')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Nhận danh sách chọn hàng cho một lô hàng [Coordinator, Kitchen]',
  })
  async getPickingList(@Param('id') id: string) {
    return this.shipmentService.getPickingList(id);
  }

  @Get('incoming')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách hàng đang đến [Franchise Staff]',
  })
  async getIncomingShipments(@CurrentUser() user: IJwtPayload) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.getIncomingShipments(user.storeId);
  }

  @Get(':id')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết kiện hàng [Franchise Staff]',
  })
  async getShipmentDetail(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
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
      throw new Error('User không có storeId');
    }
    return this.shipmentService.receiveShipment(
      id,
      dto,
      user.sub,
      user.storeId,
    );
  }
}
