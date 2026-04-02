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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { GetBatchesDto } from './dto/get-batches.dto';
import { GetProductsDto } from './dto/get-products.dto';
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
  @ResponseMessage('Success')
  async create(@Body() createProductDto: CreateProductDto) {
    return await this.productService.createProduct(createProductDto);
  }

  @Get()
  @Roles(
    UserRole.MANAGER,
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách sản phẩm [Manager, Store Staff, Kitchen Staff, Supply Coordinator]',
  })
  @ResponseMessage('Success')
  async findAll(@Query() filter: GetProductsDto) {
    return await this.productService.getProducts(filter);
  }

  @Get('batches')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.FRANCHISE_STORE_STAFF,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách lô hàng [Manager, Central Kitchen Staff, Supply Coordinator, Franchise Staff]',
    description:
      'Query: `search` (mã lô hoặc tên SP), `batchCode` (chỉ lọc theo mã lô, một phần), `productId`, khoảng HSD, phân trang. Mỗi item có thêm `productName`, `productSku`, `currentQuantity`.',
  })
  @ResponseMessage('Success')
  async findAllBatches(@Query() filter: GetBatchesDto) {
    return await this.productService.getBatches(filter);
  }

  @Get(':id')
  @Roles(
    UserRole.MANAGER,
    UserRole.FRANCHISE_STORE_STAFF,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary:
      'Chi tiết sản phẩm [Manager, Store Staff, Kitchen Staff, Supply Coordinator]',
  })
  @ResponseMessage('Success')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.getProduct(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật sản phẩm [Manager]' })
  @ResponseMessage('Success')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return await this.productService.updateProduct(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa sản phẩm (Soft delete) [Manager]' })
  @ResponseMessage('Success')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.removeProduct(id);
  }

  @Patch(':id/restore')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Khôi phục sản phẩm [Manager]' })
  @ResponseMessage('Success')
  async restore(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.restoreProduct(id);
  }

  // --- BATCHES ---

  @Get('batches/:id')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
    UserRole.FRANCHISE_STORE_STAFF,
  )
  @ApiParam({
    name: 'id',
    description:
      'ID số của lô (ví dụ 42) hoặc mã lô `batch_code` (ví dụ PCC300STFG-20260401-3CAC3C24). Chuỗi chỉ gồm chữ số được hiểu là ID.',
    example: 42,
  })
  @ApiOperation({
    summary:
      'Chi tiết lô hàng theo ID hoặc mã lô (batch_code) [Manager, Central Kitchen Staff, Supply Coordinator, Franchise Staff]',
  })
  @ResponseMessage('Success')
  async findOneBatch(@Param('id') idOrBatchCode: string) {
    return await this.productService.getBatch(idOrBatchCode);
  }

  @Patch('batches/:id')
  @Roles(
    UserRole.MANAGER,
    UserRole.CENTRAL_KITCHEN_STAFF,
    UserRole.SUPPLY_COORDINATOR,
  )
  @ApiOperation({
    summary: 'Cập nhật lô hàng [Manager, Central Kitchen Staff]',
  })
  @ResponseMessage('Success')
  async updateBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBatchDto: UpdateBatchDto,
  ) {
    return await this.productService.updateBatch(id, updateBatchDto);
  }
}
