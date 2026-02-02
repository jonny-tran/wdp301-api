import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from '../shipment/constants/shipment-status.enum';
import { ShipmentRepository } from '../shipment/shipment.repository';
import { ClaimRepository } from './claim.repository';
import { ClaimStatus } from './constants/claim-status.enum';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { ResolveClaimDto } from './dto/resolve-claim.dto';

@Injectable()
export class ClaimService {
  private readonly orderStatusEnum = OrderStatus;
  private readonly shipmentStatusEnum = ShipmentStatus;
  private readonly claimStatusEnum = ClaimStatus;

  constructor(
    private readonly claimRepository: ClaimRepository,
    private readonly shipmentRepository: ShipmentRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async createManualClaim(
    dto: CreateManualClaimDto,
    userId: string,
    storeId: string,
  ) {
    return this.uow.runInTransaction(async (tx) => {
      // 1. Get Shipment
      const shipment = await this.shipmentRepository.getShipmentWithItems(
        dto.shipmentId,
      );

      if (!shipment) {
        throw new NotFoundException('Không tìm thấy chuyến hàng');
      }

      // 2. Validate Ownership
      if (shipment.order.store.id !== storeId) {
        throw new ForbiddenException('Chuyến hàng không thuộc cửa hàng này');
      }

      // 3. Validate Status
      if (shipment.status !== (this.shipmentStatusEnum.COMPLETED as string)) {
        throw new HttpException(
          'Chuyến hàng chưa hoàn thành, không thể tạo khiếu nại',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 4. Validate Items
      for (const item of dto.items) {
        // Check Batch in Shipment
        const shipmentItem = shipment.items.find(
          (si) => si.batchId === item.batchId,
        );
        if (!shipmentItem) {
          throw new HttpException(
            `Batch ${item.batchId} không có trong chuyến hàng này`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // Check Product match
        if (shipmentItem.batch.productId !== item.productId) {
          throw new HttpException(
            `Product ID không khớp với Batch ID`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // Check Evidence
        if (item.quantityDamaged > 0 && !item.imageProofUrl) {
          throw new HttpException(
            `Hàng hỏng (SP: ${item.productId}) bắt buộc phải có ảnh bằng chứng`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // 5. Create Claim
      const claim = await this.claimRepository.createClaim(
        dto.shipmentId,
        userId,
        tx,
      );

      // 6. Create Items
      const claimItemsPayload = dto.items.map((item) => ({
        claimId: claim.id,
        productId: item.productId,
        quantityMissing: item.quantityMissing,
        quantityDamaged: item.quantityDamaged,
        reason: item.reason,
        imageUrl: item.imageProofUrl,
      }));

      await this.claimRepository.createClaimItems(claimItemsPayload, tx);

      // 7. Update Order Status
      await this.shipmentRepository.updateOrderStatus(
        shipment.orderId,
        this.orderStatusEnum.CLAIMED,
        tx,
      );

      return claim;
    });
  }

  async resolveClaim(id: string, dto: ResolveClaimDto) {
    const claim = await this.claimRepository.getClaimById(id);

    if (!claim) {
      throw new NotFoundException('Không tìm thấy khiếu nại');
    }

    if (claim.status !== (this.claimStatusEnum.PENDING as string)) {
      throw new HttpException(
        'Khiếu nại đã được xử lý',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.claimRepository.updateClaimStatus(id, dto.status);
  }

  async getClaimsByStore(storeId: string) {
    const claims = await this.claimRepository.getClaimsByStoreId(storeId);

    return claims.map((claim) => ({
      id: claim.id,
      shipmentId: claim.shipmentId,
      status: claim.status,
      createdAt: claim.createdAt,
      resolvedAt: claim.resolvedAt,
      items: claim.items.map((item) => ({
        productName: item.product.name,
        sku: item.product.sku,
        quantityMissing: parseFloat(item.quantityMissing || '0'),
        quantityDamaged: parseFloat(item.quantityDamaged || '0'),
        reason: item.reason,
        imageUrl: item.imageUrl,
      })),
    }));
  }

  async getClaimDetail(id: string, storeId: string) {
    const claim = await this.claimRepository.getClaimById(id);

    if (!claim) {
      throw new NotFoundException('Không tìm thấy khiếu nại này');
    }

    if (claim.shipment.order.store.id !== storeId) {
      throw new ForbiddenException('Bạn không có quyền xem khiếu nại này');
    }

    return {
      id: claim.id,
      shipmentId: claim.shipmentId,
      status: claim.status,
      createdAt: claim.createdAt,
      resolvedAt: claim.resolvedAt,
      items: claim.items.map((item) => ({
        productName: item.product.name,
        sku: item.product.sku,
        quantityMissing: parseFloat(item.quantityMissing || '0'),
        quantityDamaged: parseFloat(item.quantityDamaged || '0'),
        reason: item.reason,
        imageUrl: item.imageUrl,
      })),
    };
  }

  async createClaim(
    shipmentId: string,
    createdBy: string,
    items: {
      productId: number;
      quantityMissing: number;
      quantityDamaged: number;
      reason?: string;
      imageUrl?: string;
    }[],
    tx: NodePgDatabase<typeof schema>,
  ) {
    // Create claim
    const claim = await this.claimRepository.createClaim(
      shipmentId,
      createdBy,
      tx,
    );

    // Create claim items
    const claimItems = items.map((item) => ({
      claimId: claim.id,
      productId: item.productId,
      quantityMissing: item.quantityMissing,
      quantityDamaged: item.quantityDamaged,
      reason: item.reason,
      imageUrl: item.imageUrl,
    }));

    await this.claimRepository.createClaimItems(claimItems, tx);

    return claim;
  }
}
