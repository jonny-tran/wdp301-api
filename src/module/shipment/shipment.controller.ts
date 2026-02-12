import {
  BadRequestException,
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
  @ResponseMessage('Lấy chi tiết lô hàng thành công')
  async getShipmentDetail(
    @Param('id') id: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (!user.storeId && user.role !== (UserRole.ADMIN as any)) {
      throw new BadRequestException('User không có storeId');
    }
    if (!user.storeId) {
      // extra check redundant but keeping logic similar to existing
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.getShipmentDetail(id, user.storeId);
  }

  @Patch(':id/receive-all')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Nhận hàng nhanh (Đủ hàng, không hỏng) [Franchise Staff]',
    description:
      'Xác nhận nhận toàn bộ hàng trong đơn, không có hàng thiếu hay hỏng.',
  })
  @ResponseMessage('Nhận hàng thành công (Đủ hàng)')
  async receiveAll(@Param('id') id: string, @CurrentUser() user: IJwtPayload) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    // Call service with empty items list (implies Receive All)
    const dto = new ReceiveShipmentDto();
    dto.items = [];

    return this.shipmentService.receiveShipment(
      id,
      dto,
      user.sub,
      user.storeId,
    );
  }

  @Post(':id/receive')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Nhận hàng chi tiết (Báo cáo thiếu/hỏng) [Franchise Staff]',
    description:
      'Xác nhận nhận hàng, có thể báo cáo số lượng thực nhận và hàng hỏng cho từng lô.',
  })
  @ResponseMessage('Xác nhận nhận hàng thành công')
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
