import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('Logistics')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  // --- Vehicles (read: SC + manager + admin) ---

  @Get('vehicles')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Danh sách xe',
    description:
      '**Roles:** supply_coordinator, manager, admin. Trả về toàn bộ phương tiện logistics.',
  })
  @ApiResponse({ status: 200, description: 'Danh sách xe' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền' })
  findAllVehicles() {
    return this.logisticsService.findAllVehicles();
  }

  @Get('vehicles/:id')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Chi tiết xe theo id',
    description: '**Roles:** supply_coordinator, manager, admin.',
  })
  @ApiResponse({ status: 200, description: 'Thông tin xe' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe' })
  findOneVehicle(@Param('id', ParseIntPipe) id: number) {
    return this.logisticsService.findVehicleById(id);
  }

  @Post('vehicles')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo xe mới',
    description:
      '**Roles:** manager, admin. `license_plate` phải duy nhất; payload_capacity, fuel_rate_per_km > 0.',
  })
  @ApiResponse({ status: 201, description: 'Đã tạo xe' })
  @ApiConflictResponse({ description: 'Trùng biển số hoặc vi phạm ràng buộc' })
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.logisticsService.createVehicle(dto);
  }

  @Patch('vehicles/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cập nhật xe',
    description: '**Roles:** manager, admin.',
  })
  @ApiResponse({ status: 200, description: 'Đã cập nhật' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe' })
  @ApiConflictResponse({ description: 'Trùng biển số' })
  updateVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.logisticsService.updateVehicle(id, dto);
  }

  @Delete('vehicles/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xóa xe',
    description:
      '**Roles:** manager, admin. Không xóa được nếu xe đang tham chiếu shipment.',
  })
  @ApiResponse({ status: 200, description: 'Đã xóa' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe' })
  @ApiConflictResponse({ description: 'Còn tham chiếu — không xóa được' })
  removeVehicle(@Param('id', ParseIntPipe) id: number) {
    return this.logisticsService.removeVehicle(id);
  }

  // --- Routes ---

  @Get('routes')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Danh sách tuyến đường',
    description: '**Roles:** supply_coordinator, manager, admin.',
  })
  @ApiResponse({ status: 200, description: 'Danh sách tuyến' })
  findAllRoutes() {
    return this.logisticsService.findAllRoutes();
  }

  @Get('routes/:id')
  @Roles(
    UserRole.SUPPLY_COORDINATOR,
    UserRole.MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Chi tiết tuyến theo id',
    description: '**Roles:** supply_coordinator, manager, admin.',
  })
  @ApiResponse({ status: 200, description: 'Thông tin tuyến' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tuyến' })
  findOneRoute(@Param('id', ParseIntPipe) id: number) {
    return this.logisticsService.findRouteById(id);
  }

  @Post('routes')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo tuyến mới',
    description:
      '**Roles:** manager, admin. distance_km, estimated_hours, base_transport_cost phải > 0.',
  })
  @ApiResponse({ status: 201, description: 'Đã tạo tuyến' })
  createRoute(@Body() dto: CreateRouteDto) {
    return this.logisticsService.createRoute(dto);
  }

  @Patch('routes/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cập nhật tuyến',
    description: '**Roles:** manager, admin.',
  })
  @ApiResponse({ status: 200, description: 'Đã cập nhật' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tuyến' })
  updateRoute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.logisticsService.updateRoute(id, dto);
  }

  @Delete('routes/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Xóa tuyến',
    description:
      '**Roles:** manager, admin. Không xóa được nếu tuyến gắn cửa hàng / shipment.',
  })
  @ApiResponse({ status: 200, description: 'Đã xóa' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tuyến' })
  @ApiConflictResponse({ description: 'Còn tham chiếu — không xóa được' })
  removeRoute(@Param('id', ParseIntPipe) id: number) {
    return this.logisticsService.removeRoute(id);
  }
}
