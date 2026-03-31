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
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Roles } from 'src/module/auth/decorators/roles.decorator';
import { UserRole } from 'src/module/auth/dto/create-user.dto';
import { AtGuard } from 'src/module/auth/guards/auth.guard';
import { RolesGuard } from 'src/module/auth/guards/roles.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { GetSuppliersDto } from './dto/get-suppliers.dto';
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
  @ApiOperation({
    summary: 'Tạo nhà cung cấp mới [Manager]',
    description:
      '**Quyền truy cập (Roles):** Manager\n\n**Nghiệp vụ:** Khởi tạo đối tác cung ứng (thông tin liên hệ, phục vụ phiếu nhập inbound và mua hàng).',
  })
  @ResponseMessage('Tạo nhà cung cấp thành công')
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.create(createSupplierDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách nhà cung cấp (lọc & phân trang) [Authenticated]',
    description:
      '**Quyền truy cập (Roles):** Mọi người dùng đã đăng nhập (không giới hạn `@Roles` trên endpoint)\n\n**Nghiệp vụ:** Tra cứu NCC theo `GetSuppliersDto` — thường dùng khi lập phiếu nhập hoặc tham chiếu master data.',
  })
  @ResponseMessage('Lấy danh sách nhà cung cấp thành công')
  findAll(@Query() query: GetSuppliersDto) {
    return this.supplierService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết một nhà cung cấp [Authenticated]',
    description:
      '**Quyền truy cập (Roles):** Mọi người dùng đã đăng nhập\n\n**Nghiệp vụ:** Xem thông tin chi tiết một NCC theo ID.',
  })
  @ResponseMessage('Lấy thông tin nhà cung cấp thành công')
  findOne(@Param('id') id: string) {
    return this.supplierService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @ApiOperation({
    summary: 'Cập nhật nhà cung cấp [Manager]',
    description:
      '**Quyền truy cập (Roles):** Manager\n\n**Nghiệp vụ:** Sửa thông tin đối tác (`UpdateSupplierDto`).',
  })
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
  @ApiOperation({
    summary: 'Xóa nhà cung cấp [Manager]',
    description:
      '**Quyền truy cập (Roles):** Manager\n\n**Nghiệp vụ:** Xóa bản ghi NCC (cần đảm bảo không vi phạm ràng buộc dữ liệu — theo logic service/repository).',
  })
  @ResponseMessage('Xóa nhà cung cấp thành công')
  remove(@Param('id') id: string) {
    return this.supplierService.remove(+id);
  }
}
