import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InboundService } from './inbound.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { AddReceiptItemDto } from './dto/add-receipt-item.dto';
import { ReprintBatchDto } from './dto/reprint-batch.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestWithUser } from '../auth/types/auth.types';
import { AtGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Inbound Logistics')
@ApiBearerAuth()
@UseGuards(AtGuard, RolesGuard)
@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Post('receipts')
  @ApiOperation({ summary: 'API 1: Tạo phiếu' })
  async createReceipt(
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.createReceipt(user, dto);
  }

  @Post('receipts/:id/items')
  @ApiOperation({ summary: 'API 2: Thêm hàng vào phiếu (Generate Batch)' })
  async addReceiptItem(
    @Param('id') id: string,
    @Body() dto: AddReceiptItemDto,
  ) {
    return this.inboundService.addReceiptItem(id, dto);
  }

  @Get('batches/:id/label')
  @ApiOperation({
    summary: 'API 3: Lấy data in tem( Get QR Label Data for Batch)',
  })
  async getBatchLabel(@Param('id') id: string) {
    return this.inboundService.getBatchLabel(Number(id));
  }

  @Patch('receipts/:id/complete')
  @ApiOperation({
    summary: 'API 4: Chốt phiếu (Complete Receipt & Update Inventory)',
  })
  async completeReceipt(@Param('id') id: string) {
    return this.inboundService.completeReceipt(id);
  }

  @Delete('items/:batchId')
  @ApiOperation({ summary: 'API 5: Xóa lô hàng lỗi (Only DRAFT)' })
  async deleteBatchItem(@Param('batchId') batchId: string) {
    return this.inboundService.deleteBatchItem(Number(batchId));
  }

  @Post('batches/reprint')
  @ApiOperation({ summary: 'API 8: Yêu cầu in lại tem (Audit Log)' })
  async reprintBatchLabel(
    @Body() dto: ReprintBatchDto,
    @CurrentUser() user: RequestWithUser['user'],
  ) {
    return this.inboundService.reprintBatchLabel(dto, user);
  }
}
