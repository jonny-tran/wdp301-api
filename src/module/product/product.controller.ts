import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BatchFilterDto } from './dto/batch-filter.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

@Controller('products')
@ApiTags('Products & Batches')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // --- PRODUCTS ---

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo sản phẩm mới [Manager]' })
  @ResponseMessage('Tạo sản phẩm thành công')
  async create(@Body() createProductDto: CreateProductDto) {
    return await this.productService.createProduct(createProductDto);
  }

  @Get()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm [Manager]' })
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  async findAll(@Query() filter: ProductFilterDto) {
    return await this.productService.getProducts(filter);
  }

  @Get('batches')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Lấy danh sách lô hàng [Manager, Central Kitchen Staff]',
  })
  @ResponseMessage('Lấy danh sách lô hàng thành công')
  async findAllBatches(@Query() filter: BatchFilterDto) {
    return await this.productService.getBatches(filter);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết sản phẩm [Manager]' })
  @ResponseMessage('Lấy thông tin sản phẩm thành công')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.getProduct(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật sản phẩm [Manager]' })
  @ResponseMessage('Cập nhật sản phẩm thành công')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return await this.productService.updateProduct(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa sản phẩm (Soft delete) [Manager]' })
  @ResponseMessage('Xóa sản phẩm thành công')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.removeProduct(id);
  }

  @Patch(':id/restore')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Khôi phục sản phẩm [Manager]' })
  @ResponseMessage('Khôi phục sản phẩm thành công')
  async restore(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.restoreProduct(id);
  }

  // --- BATCHES ---

  @Get('batches/:id')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Chi tiết lô hàng [Manager, Central Kitchen Staff]',
  })
  @ResponseMessage('Lấy chi tiết lô hàng thành công')
  async findOneBatch(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.getBatch(id);
  }

  @Post(':id/batches')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Tạo lô hàng mới cho sản phẩm [Manager, Central Kitchen Staff]',
  })
  @ResponseMessage('Tạo lô hàng mới thành công')
  async createBatch(
    @Param('id', ParseIntPipe) productId: number,
    @Body() createBatchDto: CreateBatchDto,
  ) {
    return await this.productService.createBatch(productId, createBatchDto);
  }

  @Patch('batches/:id')
  @Roles(UserRole.MANAGER, UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Cập nhật lô hàng [Manager, Central Kitchen Staff]',
  })
  @ResponseMessage('Cập nhật lô hàng thành công')
  async updateBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBatchDto: UpdateBatchDto,
  ) {
    return await this.productService.updateBatch(id, updateBatchDto);
  }
}
