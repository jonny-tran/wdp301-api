import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
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
import { RequestWithUser } from '../auth/types/auth.types';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { CompleteProductionDto } from './dto/complete-production.dto';
import { CompleteSalvageDto } from './dto/complete-salvage.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CreateSalvageDto } from './dto/create-salvage.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { GetProductionOrdersQueryDto } from './dto/get-production-orders-query.dto';
import { GetRecipesQueryDto } from './dto/get-recipes-query.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
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
      '**Quyền truy cập (Roles):** Manager, Central Kitchen Staff\n\n**Nghiệp vụ:** Thành phẩm (`productId`) phải là **finished_good**; mỗi dòng nguyên liệu dùng **productId** loại **raw_material**. Định mức `quantity` = số lượng NL cho **1 đơn vị** thành phẩm. Tên công thức lấy theo tên sản phẩm thành phẩm.',
  })
  @ResponseMessage('Đã tạo công thức')
  async createRecipe(@Body() dto: CreateRecipeDto) {
    return this.productionService.createRecipe({
      productId: dto.productId,
      items: dto.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    });
  }

  @Get('recipes')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Danh sách công thức (BOM) [Manager, Kitchen, Admin]',
    description:
      'Phân trang; `search` theo tên thành phẩm / tên công thức. Mỗi dòng có `ingredientCount` (số nguyên liệu). Không còn `standardOutput` — định mức xem từng dòng `quantityPerOutput` (1 đơn vị TP).',
  })
  @ResponseMessage('Success')
  listRecipes(@Query() query: GetRecipesQueryDto) {
    return this.productionService.listRecipes(query);
  }

  @Get('recipes/:id')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Chi tiết công thức + BOM đầy đủ [Manager, Kitchen, Admin]',
  })
  @ResponseMessage('Success')
  getRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.productionService.getRecipeById(id);
  }

  @Patch('recipes/:id')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Cập nhật công thức [Manager, Kitchen]',
    description:
      'Đổi `productId` (thành phẩm), thay toàn bộ `items`, hoặc `isActive`. Không đổi BOM/thành phẩm nếu còn lệnh **draft** / **in_progress** gắn công thức này.',
  })
  @ResponseMessage('Đã cập nhật công thức')
  updateRecipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecipeDto,
  ) {
    return this.productionService.updateRecipe(id, dto);
  }

  @Delete('recipes/:id')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Ngừng công thức (soft) [Manager, Kitchen]',
    description: 'Đặt `is_active = false`.',
  })
  @ResponseMessage('Đã ngừng công thức')
  removeRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.productionService.softDeleteRecipe(id);
  }

  @Get('orders')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Danh sách lệnh sản xuất [Manager, Kitchen, Coordinator, Admin]',
    description:
      'Lọc `status`: `draft`, `pending`, `in_progress`, `completed`, `cancelled` (CSV hoặc lặp query). Phân trang `page`/`limit`. `pending` = yêu cầu từ điều phối khi duyệt đơn (có `note` / `reference_id`).',
  })
  @ResponseMessage('Success')
  listOrders(@Query() query: GetProductionOrdersQueryDto) {
    return this.productionService.listProductionOrders(query);
  }

  @Get('orders/:id')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Chi tiết lệnh sản xuất — reservation, lineage, giao dịch kho [Manager, Kitchen, Coordinator, Admin]',
    description:
      '`inventoryTransactions` gồm các bản ghi `reference_id` = `PRODUCTION:{id}` (consume, output, waste PRODUCTION_LOSS, surplus adjustment…).',
  })
  @ResponseMessage('Success')
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionService.getProductionOrderById(id);
  }

  @Post('salvage')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Tạo lệnh salvage — giữ chỗ đúng một lô NL, không FEFO [Kitchen, Manager]',
    description:
      'BOM phải có **đúng một** dòng nguyên liệu trùng sản phẩm trên lô. Lô chưa quá hạn (VN).',
  })
  @ResponseMessage('Đã tạo lệnh salvage và giữ chỗ lô')
  async createSalvage(
    @Body() dto: CreateSalvageDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    const wh = await this.warehouseRepo.findCentralWarehouseId();
    if (!wh) {
      throw new NotFoundException('Không tìm thấy kho trung tâm');
    }
    return this.productionService.createSalvageProductionOrder({
      inputBatchId: dto.inputBatchId,
      recipeId: dto.recipeId,
      quantityToConsume: dto.quantityToConsume,
      warehouseId: wh.id,
      createdBy: user.userId,
    });
  }

  @Post('salvage/:id/complete')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Hoàn tất salvage — trừ lô NL, nhập lô TP, lineage, giao dịch kho [Kitchen, Manager]',
  })
  @ResponseMessage('Hoàn tất salvage')
  async completeSalvage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteSalvageDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.productionService.completeSalvageProduction(id, {
      actualYield: dto.actualYield,
      surplusNote: dto.surplusNote,
      callerRole: user.role,
    });
  }

  @Post('orders')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Tạo lệnh sản xuất (draft) [Kitchen, Manager]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff, Manager\n\n**Nghiệp vụ:** `productId` = thành phẩm **finished_good**; hệ thống gắn đúng **một** công thức active. Khối lượng kế hoạch tại **kho trung tâm**.',
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
      productId: dto.productId,
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
