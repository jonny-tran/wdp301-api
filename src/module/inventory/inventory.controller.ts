import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { InventoryDto } from './inventory.dto';
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
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
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
  @Roles(UserRole.FRANCHISE_STORE_STAFF)
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
}
