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
import { GetReceiptsDto } from './dto/get-receipts.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import { InboundService } from './inbound.service';

@ApiTags('Inbound Logistics')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Post('receipts')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Khởi tạo phiếu nhập hàng mới từ nhà cung cấp [Kitchen]',
    description: 'Tạo khung cho biên lai nhập kho trước khi quét hàng thực tế',
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
    summary: 'Xem danh sách tất cả các phiếu nhập hàng [Kitchen]',
    description: 'Dùng để theo dõi lịch sử và các phiếu đang chờ hoàn tất.',
  })
  @ResponseMessage('Lấy danh sách phiếu nhập thành công')
  async getAllReceipts(@Query() query: GetReceiptsDto) {
    return this.inboundService.getAllReceipts(query);
  }

  @Get('receipts/:id')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary:
      'Xem thông tin chi tiết và danh sách hàng hóa của một phiếu nhập [Kitchen]',
    description:
      'Hiển thị toàn bộ các sản phẩm và mã lô đã khai báo trong biên lai. omitExpected=true: ẩn số dự kiến (màn kiểm đếm).',
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
    summary: 'Khai báo hàng thực tế dỡ từ xe xuống vào phiếu nhập [Kitchen]',
    description:
      'Ghi nhận NSX, chấp nhận/từ chối, tách HSD. Mã lô (BAT-…) được tạo khi chốt phiếu.',
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
    summary:
      'Lấy thông tin mã QR của lô hàng vừa nhập để in tem nhãn [Kitchen]',
    description: 'Dùng để dán tem định danh lên từng thùng hàng vừa nhập kho',
  })
  @ResponseMessage('Lấy data in QRCode thành công')
  async getBatchLabel(@Param('id') id: string) {
    return this.inboundService.getBatchLabel(Number(id));
  }

  @Patch('receipts/:id/complete')
  @ApiOperation({
    summary:
      'Xác nhận hoàn tất biên lai và chính thức nhập hàng vào kho [Kitchen]',
    description:
      'Tạo lô BAT-…, cộng tồn, ghi log IMPORT. Cần phê duyệt trước nếu nhập dư vượt ngưỡng.',
  })
  @ResponseMessage('Chốt phiếu thành công')
  async completeReceipt(@Param('id') id: string) {
    return this.inboundService.completeReceipt(id);
  }

  @Patch('receipts/:id/variance-approval')
  @Roles(UserRole.MANAGER, UserRole.SUPPLY_COORDINATOR)
  @ApiOperation({
    summary: 'Phê duyệt nhập vượt ngưỡng sai số (điều phối / quản lý)',
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
    summary: 'Xóa một dòng khỏi phiếu nhập nháp [Kitchen]',
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
    summary: 'Xóa theo batchId (tương thích phiếu cũ)',
  })
  @ResponseMessage('Xóa lô hàng lỗi thành công')
  async deleteBatchItem(@Param('batchId') batchId: string) {
    return this.inboundService.deleteBatchItem(Number(batchId));
  }

  @Post('batches/reprint')
  @Roles(UserRole.CENTRAL_KITCHEN_STAFF)
  @ApiOperation({
    summary: 'Yêu cầu in lại tem cho lô hàng đã nhập [Kitchen]',
    description:
      'Hệ thống sẽ ghi log lại hành động in lại tem để đảm bảo tính minh bạch',
  })
  @ResponseMessage('Yêu cầu in lại tem thành công')
  async reprintBatchLabel(
    @Body() dto: ReprintBatchDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.reprintBatchLabel(dto, user);
  }
}
