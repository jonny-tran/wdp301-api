import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateStoreDto } from './dto/create-store.dto';
import { GetStoresFilterDto } from './dto/get-stores-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { FranchiseStoreService } from './franchise-store.service';

@ApiTags('Franchise Stores')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('stores')
export class FranchiseStoreController {
  constructor(private readonly franchiseStoreService: FranchiseStoreService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo store mới [Manager]' })
  async create(@Body() dto: CreateStoreDto) {
    return this.franchiseStoreService.createStore(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({ summary: 'Lấy danh sách store [Manager, Coordinator]' })
  async findAll(@Query() filter: GetStoresFilterDto) {
    return this.franchiseStoreService.findAll(filter);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Lấy chi tiết store [Manager]' })
  async findOne(@Param('id') id: string) {
    return this.franchiseStoreService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật store [Manager]' })
  async update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.franchiseStoreService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa Store[Manager]' })
  async remove(@Param('id') id: string) {
    return this.franchiseStoreService.remove(id);
  }
}
