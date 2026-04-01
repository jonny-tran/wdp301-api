import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IJwtPayload } from '../auth/types/auth.types';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { KitchenAdjustInventoryDto } from './dto/kitchen-adjust-inventory.dto';
import { KitchenSummaryQueryDto } from './dto/kitchen-summary-query.dto';
import { InventoryDto } from './inventory.dto';
import { InventoryService } from './inventory.service';
import {
  AgingReportQueryDto,
  WasteReportQueryDto,
  FinancialLossQueryDto,
} from './dto/analytics-query.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('store')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tồn kho theo cửa hàng (JWT) [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Trả về tồn tại kho nội bộ của cửa hàng đăng nhập (`storeId` từ JWT); hỗ trợ lọc/tìm qua `GetStoreInventoryDto`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách tồn kho tại cửa hàng',
    type: [InventoryDto],
  })
  async getStoreInventory(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetStoreInventoryDto,
  ) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }

    return this.inventoryService.getInventoryByStoreId(user.storeId, query);
  }

  @Get('store/transactions')
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lịch sử giao dịch kho cửa hàng [Admin, Franchise Staff]',
    description:
      '**Quyền truy cập (Roles):** Admin, Franchise Store Staff\n\n**Nghiệp vụ:** Audit trail nhập/xuất/điều chỉnh tại kho cửa hàng của user.',
  })
  async getStoreTransactions(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetInventoryTransactionsDto,
  ) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }

    return this.inventoryService.getStoreTransactions(user.storeId, query);
  }

  @Get('summary')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Tổng quan tồn kho bếp (macro) — kho lấy từ JWT [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Không gửi `warehouseId`.** Backend xác định kho bếp trung tâm từ `storeId` trong Bearer JWT (ưu tiên warehouse `central` cùng store; fallback kho central đầu tiên).\n\n**Công thức:** Physical = Available + Reserved (aggregate theo product).',
  })
  async getInventorySummary(
    @CurrentUser() user: IJwtPayload,
    @Query() query: KitchenSummaryQueryDto,
  ) {
    return this.inventoryService.getKitchenInventorySummary(user, query);
  }

  @Get('product/:productId/batches')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary: 'Chi tiết lô theo sản phẩm (FEFO) — kho từ JWT',
    description:
      'Lọc theo kho bếp của user; sắp xếp `expiryDate` ASC. `isNextFEFO`: lô cũ nhất còn `availableQty > 0`.',
  })
  async getKitchenProductBatches(
    @CurrentUser() user: IJwtPayload,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.inventoryService.getKitchenProductBatches(user, productId);
  }

  @Get('transactions')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary: 'Lịch sử biến động kho bếp (audit) — kho từ JWT',
    description:
      'Query: `batchId`, `type`, `fromDate`, `toDate`, phân trang. Chỉ dữ liệu warehouse bếp của user.',
  })
  async getKitchenTransactions(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetInventoryTransactionsDto,
  ) {
    return this.inventoryService.getKitchenInventoryTransactions(user, query);
  }

  @Get('low-stock')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cảnh báo tồn kho thấp [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Liệt kê SKU dưới ngưỡng tối thiểu (`min_stock_level`), có thể lọc theo `warehouseId`.',
  })
  async getLowStockReport(@Query('warehouseId') warehouseId?: number) {
    return this.inventoryService.getLowStockItems(
      warehouseId ? Number(warehouseId) : undefined,
    );
  }

  @Post('adjust')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
  )
  @ApiOperation({
    summary:
      'Điều chỉnh kho bếp (kiểm kê / hỏng / sai số) — kho từ JWT [Admin, Manager, Kitchen]',
    description:
      'Body: `batchId`, `actualQuantity`, `reasonCode`, `note`. Không gửi `warehouseId`. Ghi `adjust_loss` / `adjust_surplus` + đồng bộ batch; transaction atomic.',
  })
  async adjustKitchenInventory(
    @CurrentUser() user: IJwtPayload,
    @Body() body: KitchenAdjustInventoryDto,
  ) {
    return this.inventoryService.adjustKitchenInventory(user, body);
  }

  @Get('kitchen/summary')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Tồn kho bếp gom theo sản phẩm [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Central Kitchen Staff, Supply Coordinator\n\n**Nghiệp vụ:** Tổng quan tồn kho trung tâm **group theo product** phục vụ bếp và điều phối (`GetKitchenInventoryDto`).',
  })
  async getKitchenSummary(
    @CurrentUser() user: IJwtPayload,
    @Query() query: GetKitchenInventoryDto,
  ) {
    return this.inventoryService.getKitchenSummary(query, user);
  }

  @Get('kitchen/details')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.ADMIN,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Chi tiết lô theo một sản phẩm (drill-down) [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Central Kitchen Staff, Supply Coordinator\n\n**Nghiệp vụ:** Drill-down từng **batch** của một `product_id`: HSD, số lượng thực, số lượng **reserve**.',
  })
  async getKitchenDetails(
    @CurrentUser() user: IJwtPayload,
    @Query('product_id') productId: number,
  ) {
    return this.inventoryService.getKitchenDetails(Number(productId), user);
  }

  @Get('analytics/summary')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Dashboard sức khỏe kho bếp [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Central Kitchen Staff, Supply Coordinator\n\n**Nghiệp vụ:** Chỉ số tổng quan tồn/rủi ro phục vụ vận hành kho trung tâm.',
  })
  async getAnalyticsSummary(@CurrentUser() user: IJwtPayload) {
    return this.inventoryService.getAnalyticsSummary(user);
  }

  @Get('analytics/aging')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Báo cáo tuổi hàng (Aging) [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Kho bếp theo JWT** (central + storeId / ưu tiên kho có tồn). Phân tích tồn theo HSD / shelf life.',
  })
  async getAgingReport(
    @CurrentUser() user: IJwtPayload,
    @Query() query: AgingReportQueryDto,
  ) {
    return this.inventoryService.getAgingReport(query, user);
  }

  @Get('analytics/waste')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Báo cáo hao hụt & hủy (Waste) [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Central Kitchen Staff, Supply Coordinator\n\n**Nghiệp vụ:** Thống kê khối lượng **WASTE** trong kỳ và KPI hủy hàng (`WasteReportQueryDto`).',
  })
  async getWasteReport(
    @CurrentUser() user: IJwtPayload,
    @Query() query: WasteReportQueryDto,
  ) {
    return this.inventoryService.getWasteReport(query, user);
  }

  @Get('analytics/financial/loss-impact')
  @Roles(
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Ước tính thiệt hại tài chính (loss impact) [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      'Hao hụt kho bếp theo JWT (`waste`, `adjust_loss`, `adjustment` âm tại warehouse đã resolve). Claims cửa hàng giữ nguyên.',
  })
  async getFinancialLoss(
    @CurrentUser() user: IJwtPayload,
    @Query() query: FinancialLossQueryDto,
  ) {
    return this.inventoryService.getFinancialLoss(query, user);
  }
}
