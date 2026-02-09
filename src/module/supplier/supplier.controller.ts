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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Roles } from 'src/module/auth/decorators/roles.decorator';
import { UserRole } from 'src/module/auth/dto/create-user.dto';
import { AtGuard } from 'src/module/auth/guards/auth.guard';
import { RolesGuard } from 'src/module/auth/guards/roles.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierService } from './supplier.service';

@ApiTags('Suppliers Management')
@Controller('suppliers')
@UseGuards(AtGuard)
@ApiBearerAuth()
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo nhà cung cấp mới [Manager]' })
  @ResponseMessage('Tạo nhà cung cấp thành công')
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.create(createSupplierDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách nhà cung cấp [Manager]' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ResponseMessage('Lấy danh sách nhà cung cấp thành công')
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.supplierService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết nhà cung cấp [Manager]' })
  @ResponseMessage('Lấy thông tin nhà cung cấp thành công')
  findOne(@Param('id') id: string) {
    return this.supplierService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật thông tin nhà cung cấp [Manager]' })
  @ResponseMessage('Cập nhật nhà cung cấp thành công')
  update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(+id, updateSupplierDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa nhà cung cấp [Manager]' })
  @ResponseMessage('Xóa nhà cung cấp thành công')
  remove(@Param('id') id: string) {
    return this.supplierService.remove(+id);
  }
}
