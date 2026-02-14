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
  //InventorySummaryQueryDto,
  WasteReportQueryDto,
} from './dto/analytics-query.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('store')
  @ApiOperation({
    summary: 'Tồn kho tại cửa hàng (staff)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách tồn kho tại cửa hàng',
    type: [InventoryDto],
  })
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
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
  @ApiOperation({
    summary: 'Lịch sử kho Store',
  })
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
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
  @ApiOperation({
    summary: 'Tổng hợp tồn kho (Manager)',
  })
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
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
  @ApiOperation({
    summary: 'Cảnh báo tồn kho thấp (Manager)',
  })
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async getLowStockReport(@Query('warehouseId') warehouseId?: number) {
    return this.inventoryService.getLowStockItems(
      warehouseId ? Number(warehouseId) : undefined,
    );
  }

  @Post('adjust')
  @ApiOperation({
    summary: 'Điều chỉnh tồn kho (Manager)',
  })
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async adjustInventory(@Body() body: InventoryAdjustmentDto) {
    return this.inventoryService.adjustInventory(body);
  }

  @Get('kitchen/summary')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'API inbound: Xem tổng tồn kho Bếp (Group by Product)',
    description:
      'API dành cho Bếp trưởng/Quản lý để xem tổng quan tồn kho các món',
  })
  async getKitchenSummary(@Query() query: GetKitchenInventoryDto) {
    return this.inventoryService.getKitchenSummary(query);
  }

  // API 7: Xem chi tiết lô hàng của một món (Drill-down)
  @Get('kitchen/details')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'API 7: Xem chi tiết lô hàng của một món (Drill-down)',
    description:
      'Xem chi tiết các lô (Hạn sử dụng, SL thực, SL giữ chỗ) của 1 sản phẩm cụ thể',
  })
  async getKitchenDetails(@Query('product_id') productId: number) {
    // productId từ @Query mặc định là string, cần ép kiểu
    return this.inventoryService.getKitchenDetails(Number(productId));
  }

  // --- ANALYTICS DASHBOARD APIS ---

  @Get('analytics/summary')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tổng quan sức khỏe kho Bếp (Manager)' })
  async getAnalyticsSummary() {
    return this.inventoryService.getAnalyticsSummary();
  }

  // API 2
  @Get('analytics/aging')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Báo cáo tuổi hàng - Aging Report (Manager)' })
  async getAgingReport(@Query() query: AgingReportQueryDto) {
    return this.inventoryService.getAgingReport(query);
  }

  @Get('analytics/waste')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Thống kê hao hụt & hủy hàng - Waste Report (Manager)',
    description:
      'Thống kê số lượng hàng đã bị hủy (WASTE). Tính toán KPI tổng khối lượng bị hủy trong kỳ.',
  })
  async getWasteReport(@Query() query: WasteReportQueryDto) {
    return this.inventoryService.getWasteReport(query);
  }
}
