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
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/create-user.dto';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestWithUser } from '../auth/types/auth.types';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { GetInboundProductsDto } from './dto/get-inbound-products.dto';
import { GetReceiptsDto } from './dto/get-receipts.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import { InboundService } from './inbound.service';

@ApiTags('Inbound Logistics')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Get('products')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Danh sách sản phẩm cho phiếu nhập (id, tên, SKU) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Trả về sản phẩm **đang active** có phân trang, lọc theo tên hoặc SKU — dùng khi khai báo dòng hàng trên phiếu nhập (chọn `productId`).',
  })
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  async getProductsForInbound(@Query() query: GetInboundProductsDto) {
    return this.inboundService.getProductsForInbound(query);
  }

  @Post('receipts')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Khởi tạo phiếu nhập hàng mới từ NCC [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Tạo phiếu nhập trạng thái nháp (`draft`) tại kho trung tâm, gắn nhà cung cấp trước khi khai báo hàng thực tế.',
  })
  @ResponseMessage('Tạo biên lai nhập kho thành công')
  async createReceipt(
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.createReceipt(user, dto);
  }

  @Get('receipts')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Danh sách phiếu nhập (lọc & phân trang) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Theo dõi lịch sử phiếu nhập và phiếu đang mở theo bộ lọc (`GetReceiptsDto`).',
  })
  @ResponseMessage('Lấy danh sách phiếu nhập thành công')
  async getAllReceipts(@Query() query: GetReceiptsDto) {
    return this.inboundService.getAllReceipts(query);
  }

  @Get('receipts/:id')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Chi tiết phiếu nhập và các dòng hàng [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Xem toàn bộ dòng khai báo và lô (nếu có). `omitExpected=true`: ẩn số dự kiến phục vụ màn kiểm đếm.',
  })
  @ResponseMessage('Lấy thông tin phiếu nhập thành công')
  async getReceiptById(
    @Param('id') id: string,
    @Query('omitExpected') omitExpected?: string,
  ) {
    return this.inboundService.getReceiptById(
      id,
      omitExpected === 'true' || omitExpected === '1',
    );
  }

  @Post('receipts/:id/items')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Thêm dòng hàng thực tế vào phiếu nhập [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Ghi nhận NSX/HSD, số lượng chấp nhận/từ chối; mã lô `BAT-…` được sinh khi **chốt phiếu** (`complete`).',
  })
  @ResponseMessage('Thêm hàng vào biên lai thành công')
  async addReceiptItem(
    @Param('id') id: string,
    @Body() dto: AddReceiptItemDto,
  ) {
    return this.inboundService.addReceiptItem(id, dto);
  }

  @Get('batches/:id/label')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Dữ liệu in tem/QR cho lô vừa nhập [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Payload in tem định danh lô sau khi nhập kho.',
  })
  @ResponseMessage('Lấy data in QRCode thành công')
  async getBatchLabel(@Param('id') id: string) {
    return this.inboundService.getBatchLabel(Number(id));
  }

  @Delete('receipts/:id')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Xóa hoàn toàn phiếu nhập nháp [Kitchen, Manager]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff, Manager\n\n**Nghiệp vụ:** Chỉ cho phiếu `draft`; xóa toàn bộ dòng và bản ghi phiếu (batch legacy gắn dòng cũng được gỡ).',
  })
  @ResponseMessage('Xóa phiếu nhập thành công')
  async removeDraftReceipt(@Param('id') id: string) {
    return this.inboundService.removeDraftReceipt(id);
  }

  @Patch('receipts/:id/complete')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Chốt phiếu nhập — tạo lô, cộng tồn, ghi IMPORT [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Chỉ áp dụng phiếu `draft` còn dòng hàng: tạo lô `BAT-…`, tăng tồn, ghi log **IMPORT**; nếu nhập dư vượt ngưỡng sai số cần **phê duyệt variance** trước.',
  })
  @ResponseMessage('Chốt phiếu thành công')
  async completeReceipt(@Param('id') id: string) {
    return this.inboundService.completeReceipt(id);
  }

  @Patch('receipts/:id/variance-approval')
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({
    summary:
      'Phê duyệt nhập vượt ngưỡng sai số [Manager, Supply Coordinator]',
    description:
      '**Quyền truy cập (Roles):** Manager, Supply Coordinator\n\n**Nghiệp vụ:** Ghi nhận phê duyệt chênh lệch so với dự kiến để phiếu có thể được chốt khi vượt ngưỡng cấu hình.',
  })
  @ResponseMessage('Phê duyệt thành công')
  async approveVariance(
    @Param('id') id: string,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.approveReceiptVariance(id, user);
  }

  @Delete('receipts/:receiptId/items/:itemId')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xóa một dòng khỏi phiếu nháp [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Chỉ cho phiếu `draft`; xóa dòng khai báo (và batch legacy nếu có).',
  })
  @ResponseMessage('Xóa dòng thành công')
  async deleteReceiptLine(
    @Param('receiptId') receiptId: string,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.inboundService.deleteReceiptLine(receiptId, itemId);
  }

  @Delete('items/:batchId')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Xóa dòng theo batchId (tương thích phiếu cũ) [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Endpoint tương thích luồng cũ; xóa theo `batchId`.',
  })
  @ResponseMessage('Xóa lô hàng lỗi thành công')
  async deleteBatchItem(@Param('batchId') batchId: string) {
    return this.inboundService.deleteBatchItem(Number(batchId));
  }

  @Post('batches/reprint')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Yêu cầu in lại tem lô đã nhập [Kitchen]',
    description:
      '**Quyền truy cập (Roles):** Central Kitchen Staff\n\n**Nghiệp vụ:** Ghi log in lại tem để truy vết; dùng khi tem hỏng hoặc mất.',
  })
  @ResponseMessage('Yêu cầu in lại tem thành công')
  async reprintBatchLabel(
    @Body() dto: ReprintBatchDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.reprintBatchLabel(dto, user);
  }
}
