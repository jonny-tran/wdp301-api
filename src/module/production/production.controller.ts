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
import { CompleteProductionDto } from './dto/complete-production.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
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

  @Post('recipes')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Tạo BOM / công thức sản xuất [Manager, Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Manager, Central Kitchen Staff\n\n**Nghiệp vụ:** Định nghĩa thành phẩm, sản lượng chuẩn và danh mục nguyên liệu (BOM) phục vụ lệnh sản xuất.',
  })
  @ResponseMessage('Đã tạo công thức')
  async createRecipe(@Body() dto: CreateRecipeDto) {
    return this.productionService.createRecipe({
      name: dto.name,
      productId: dto.productId,
      standardOutput: dto.standardOutput,
      items: dto.items.map((i) => ({
        materialId: i.materialId,
        quantity: i.quantity,
      })),
    });
  }

  @Post('orders')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Tạo lệnh sản xuất (draft) [Kitchen, Manager]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff, Manager\n\n**Nghiệp vụ:** Khởi tạo lệnh theo `recipeId` và khối lượng kế hoạch tại **kho trung tâm**, ghi nhận người tạo.',
  })
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
      plannedQuantity: dto.plannedQuantity,
      warehouseId: wh.id,
      createdBy: user.userId,
    });
  }

  @Post('orders/:id/start')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Bắt đầu sản xuất — kiểm BOM/tồn/HSD, tạm giữ NL (FEFO) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Kiểm tra đủ nguyên liệu và HSD; **tạm giữ (reserve)** nguyên liệu theo **FEFO** trước khi vào ca sản xuất.',
  })
  @ResponseMessage('Đã tạm giữ nguyên liệu')
  async start(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.startProduction(id);
  }

  @Post('orders/:id/complete')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Hoàn tất sản xuất — nhập TP, trừ NL, lô thành phẩm & lineage [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Ghi nhận sản lượng thực tế, trừ nguyên liệu đã giữ, tạo lô thành phẩm và **lineage**; Manager có thể có quyền bổ sung trong service khi xử lý chênh lệch (theo `callerRole`).',
  })
  @ResponseMessage('Hoàn tất sản xuất')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteProductionDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.productionService.completeProduction(id, {
      actualQuantity: dto.actualQuantity,
      surplusNote: dto.surplusNote,
      callerRole: user.role,
    });
  }
}
