import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
import { GetInventorySummaryDto } from './dto/get-inventory-summary.dto';
import { GetInventoryTransactionsDto } from './dto/get-inventory-transactions.dto';
import { GetKitchenInventoryDto } from './dto/get-kitchen-inventory.dto';
import { GetStoreInventoryDto } from './dto/get-store-inventory.dto';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto';
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
      'Tổng hợp tồn kho (theo kho / tìm kiếm) [Admin, Manager, Kitchen, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager, Central Kitchen Staff, Supply Coordinator\n\n**Nghiệp vụ:** Bảng tồn tổng quan theo `warehouseId` và từ khóa tìm kiếm, có phân trang.',
  })
  async getInventorySummary(@Query() query: GetInventorySummaryDto) {
    return this.inventoryService.getInventorySummary(
      {
        warehouseId: query.warehouseId,
        searchTerm: query.searchTerm,
      },
      {
        limit: query.limit || 20,
        offset: (query.page ? query.page - 1 : 0) * (query.limit || 20),
      },
    );
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
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Điều chỉnh tồn kho (hiệu chỉnh thủ công) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Ghi nhận điều chỉnh tăng/giảm tồn có kiểm soát (`InventoryAdjustmentDto`) — dùng cho kiểm kê, hỏng không qua claim, v.v.',
  })
  async adjustInventory(@Body() body: InventoryAdjustmentDto) {
    return this.inventoryService.adjustInventory(body);
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
  async getKitchenSummary(@Query() query: GetKitchenInventoryDto) {
    return this.inventoryService.getKitchenSummary(query);
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
  async getKitchenDetails(@Query('product_id') productId: number) {
    return this.inventoryService.getKitchenDetails(Number(productId));
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
  async getAnalyticsSummary() {
    return this.inventoryService.getAnalyticsSummary();
  }

  @Get('analytics/aging')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Báo cáo tuổi hàng (Aging) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Phân tích tồn theo độ “già” của hàng (HSD / thời gian lưu kho) qua `AgingReportQueryDto`.',
  })
  async getAgingReport(@Query() query: AgingReportQueryDto) {
    return this.inventoryService.getAgingReport(query);
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
  async getWasteReport(@Query() query: WasteReportQueryDto) {
    return this.inventoryService.getWasteReport(query);
  }

  @Get('analytics/financial/loss-impact')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Ước tính thiệt hại tài chính (loss impact) [Admin, Manager]',
    description:
      '**Quyền truy cập (Roles):** Admin, Manager\n\n**Nghiệp vụ:** Ước tính giá trị tổn thất tài chính từ hao hụt/hủy theo `FinancialLossQueryDto`.',
  })
  async getFinancialLoss(@Query() query: FinancialLossQueryDto) {
    return this.inventoryService.getFinancialLoss(query);
  }
}
