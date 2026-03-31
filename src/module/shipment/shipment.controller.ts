import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import type { RequestWithUser } from '../auth/types/auth.types';
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
    summary: 'Lấy danh sách lô hàng (phân trang & lọc) [Admin, Manager, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Supply Coordinator\n\n**Nghiệp vụ:** Danh sách shipment toàn hệ thống với bộ lọc (`GetShipmentsDto`) phục vụ giám sát và điều phối vận chuyển.',
  })
  @ResponseMessage('Lấy danh sách lô hàng thành công')
  async findAll(@Query() query: GetShipmentsDto) {
    return this.shipmentService.findAll(query);
  }

  @Get('store/my')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Lấy danh sách lô hàng của cửa hàng (JWT) [Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Franchise Store Staff\n\n**Nghiệp vụ:** Tự gán `storeId` từ JWT (bắt buộc có); chỉ trả về các chuyến hàng liên quan cửa hàng đăng nhập.',
  })
  @ResponseMessage('Lấy danh sách lô hàng của cửa hàng thành công')
  async getMyStoreShipments(
    @CurrentUser() user: RequestWithUser['user'],
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
    summary: 'Lấy picking list theo shipment [Admin, Supply Coordinator, Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Admin, Supply Coordinator, Central Kitchen Staff\n\n**Nghiệp vụ:** Trả về chi tiết dòng hàng và lô cần soạn cho một shipment đã tạo, phục vụ soạn hàng tại kho trung tâm.',
  })
  @ResponseMessage('Success')
  async getPickingList(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.shipmentService.getPickingList(id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Chi tiết shipment (phiếu giao hàng) [Admin, Manager, Supply Coordinator, Kitchen, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Mọi vai trò đã đăng nhập (Admin, Manager, Supply Coordinator, Central Kitchen Staff, Franchise Store Staff)\n\n**Nghiệp vụ:** Trả về thông tin chuyến giao và từng dòng hàng kèm batch; dòng được sắp xếp theo **FEFO** (hạn sử dụng tăng dần). Franchise Store Staff chỉ xem được chuyến đến đúng kho cửa hàng mình.',
  })
  @ResponseMessage('Lấy chi tiết đơn hàng vận chuyển thành công')
  async getShipmentDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    if (
      user.role === (UserRole.FRANCHISE_STORE_STAFF as string) &&
      !user.storeId
    ) {
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.getShipmentDetail(id, user.storeId, user.role);
  }

  @Patch(':id/receive-all')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Nhận hàng nhanh (đủ hàng, không hỏng) [Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Franchise Store Staff\n\n**Nghiệp vụ:** Xác nhận nhận toàn bộ số lượng theo phiếu giao, không khai báo thiếu hay hỏng — cập nhật tồn kho cửa hàng và đóng luồng nhận một bước.',
  })
  @ResponseMessage('Nhận hàng nhanh thành công')
  async receiveAll(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    const dto = new ReceiveShipmentDto();
    dto.items = [];

    return this.shipmentService.receiveShipment(
      id,
      dto,
      user.userId,
      user.storeId,
    );
  }

  @Post(':id/receive')
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
  @ApiOperation({
    summary: 'Nhận hàng chi tiết (thiếu / hỏng) [Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Franchise Store Staff\n\n**Nghiệp vụ:** Xác nhận nhận hàng với `ReceiveShipmentDto`: khai báo số lượng thực nhận và hàng hỏng theo từng dòng/lô để xử lý **discrepancy** và cập nhật tồn chính xác.',
  })
  @ResponseMessage('Success')
  async receiveShipment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReceiveShipmentDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    if (!user.storeId) {
      throw new BadRequestException('User không có storeId');
    }
    return this.shipmentService.receiveShipment(
      id,
      dto,
      user.userId,
      user.storeId,
    );
  }
}
