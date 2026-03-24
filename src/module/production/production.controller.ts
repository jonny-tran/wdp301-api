import {
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestWithUser } from '../auth/types/auth.types';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { ProductionService } from './production.service';

@ApiTags('Production')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly warehouseRepo: WarehouseRepository,
  ) {}

  @Post('orders')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo lệnh sản xuất (draft)' })
  @ResponseMessage('Tạo lệnh sản xuất')
  async createOrder(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    const wh = await this.warehouseRepo.findCentralWarehouseId();
    if (!wh) {
      throw new NotFoundException('Không tìm thấy kho trung tâm');
    }
    return this.productionService.createOrder({
      recipeId: dto.recipeId,
      outputQuantity: dto.outputQuantity,
      warehouseId: wh.id,
      createdBy: user.userId,
    });
  }

  @Post('orders/:id/start')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Bắt đầu: tạm giữ nguyên liệu FEFO' })
  @ResponseMessage('Đã tạm giữ nguyên liệu')
  async start(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.startProduction(id);
  }

  @Post('orders/:id/finish')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({ summary: 'Hoàn tất: trừ NL, tạo lô TP, ghi log' })
  @ResponseMessage('Hoàn tất sản xuất')
  async finish(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.finishProduction(id);
  }
}
