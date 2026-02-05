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
import { InventoryAdjustmentDto, InventoryDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

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
  async getStoreInventory(@CurrentUser() user: IJwtPayload) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }

    return this.inventoryService.getInventoryByStoreId(user.storeId);
  }

  @Get('store/transactions')
  @ApiOperation({
    summary: 'Lịch sử kho Store',
  })
  @Roles(UserRole.FRANCHISE_STORE_STAFF, UserRole.ADMIN)
  async getStoreTransactions(
    @CurrentUser() user: IJwtPayload,
    @Query('type') type?: 'import' | 'export' | 'waste' | 'adjustment',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    if (!user.storeId) {
      throw new Error('User không có storeId');
    }

    return this.inventoryService.getStoreTransactions(user.storeId, {
      type,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Tổng hợp tồn kho (Manager)',
  })
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async getInventorySummary(
    @Query('warehouseId') warehouseId?: number,
    @Query('categoryId') categoryId?: number,
    @Query('searchTerm') searchTerm?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const pageNumber = page ? Number(page) : 1;
    const limitNumber = limit ? Number(limit) : 20;

    return this.inventoryService.getInventorySummary(
      {
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        searchTerm,
      },
      {
        limit: limitNumber,
        offset: (pageNumber - 1) * limitNumber,
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
}
