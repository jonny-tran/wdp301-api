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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/module/auth/decorators/roles.decorator';
import { UserRole } from 'src/module/auth/dto/create-user.dto';
import { AtGuard } from 'src/module/auth/guards/auth.guard';
import { RolesGuard } from 'src/module/auth/guards/roles.guard';
import { BaseUnitService } from './base-unit.service';
import { CreateBaseUnitDto } from './dto/create-base-unit.dto';
import { UpdateBaseUnitDto } from './dto/update-base-unit.dto';

@ApiTags('Base Units')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('base-units')
export class BaseUnitController {
  constructor(private readonly baseUnitService: BaseUnitService) {}

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo đơn vị tính mới [Manager]' })
  create(@Body() dto: CreateBaseUnitDto) {
    return this.baseUnitService.create(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh sách đơn vị tính [Manager]',
  })
  findAll() {
    return this.baseUnitService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết đơn vị tính [Manager]' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.baseUnitService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật đơn vị tính [Manager]' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBaseUnitDto,
  ) {
    return this.baseUnitService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa đơn vị tính [Manager]' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.baseUnitService.remove(id);
  }
}
