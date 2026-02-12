import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { UnitOfWork } from '../../database/unit-of-work';
import { InventoryRepository } from '../inventory/inventory.repository';
import { OrderStatus } from '../order/constants/order-status.enum';
import { ShipmentStatus } from '../shipment/constants/shipment-status.enum';
import { ShipmentRepository } from '../shipment/shipment.repository';
import { ClaimRepository } from './claim.repository';
import { ClaimStatus } from './constants/claim-status.enum';
import { CreateManualClaimDto } from './dto/create-manual-claim.dto';
import { GetClaimsDto } from './dto/get-claims.dto';
import { ResolveClaimDto } from './dto/resolve-claim.dto';

@Injectable()
export class ClaimService {
  private readonly orderStatusEnum = OrderStatus;
  private readonly shipmentStatusEnum = ShipmentStatus;
  private readonly claimStatusEnum = ClaimStatus;

  constructor(
    private readonly claimRepository: ClaimRepository,
    private readonly shipmentRepository: ShipmentRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async findAll(query: GetClaimsDto) {
    return this.claimRepository.findAll(query);
  }

  async createManualClaim(
    dto: CreateManualClaimDto,
    userId: string,
    storeId: string,
  ) {
    return this.uow.runInTransaction(async (tx) => {
      // Step A: Validation - Fetch shipment details for validation
      const shipment = await this.claimRepository.getShipmentForValidation(
        dto.shipmentId,
      );

      if (!shipment) {
        throw new NotFoundException('Không tìm thấy chuyến hàng');
      }

      // Rule 1: Store Ownership Validation
      if (shipment.order.storeId !== storeId) {
        throw new ForbiddenException(
          'Bạn không có quyền tạo khiếu nại cho chuyến hàng này',
        );
      }

      // Rule 2: Status Validation - Must be COMPLETED
      if (shipment.status !== (this.shipmentStatusEnum.COMPLETED as string)) {
        throw new BadRequestException(
          'Chỉ có thể tạo khiếu nại cho chuyến hàng đã hoàn thành',
        );
      }

      // Rule 3: Golden Time Window (24 hours)
      const now = new Date();
      const shipmentCompletedTime = new Date(shipment.updatedAt!);
      const hoursDiff =
        (now.getTime() - shipmentCompletedTime.getTime()) / (1000 * 60 * 60);

      if (hoursDiff > 24) {
        throw new BadRequestException(
          'Đã quá thời gian cho phép tạo khiếu nại (24 giờ kể từ khi hoàn thành)',
        );
      }

      // Step B: Quantity Check - Validate store has enough stock for each claimed item
      const storeWarehouseId = shipment.toWarehouseId;

      for (const item of dto.items) {
        const totalClaimedQty = item.quantityMissing + item.quantityDamaged;

        if (totalClaimedQty <= 0) {
          throw new BadRequestException(
            `Số lượng khiếu nại phải lớn hơn 0 cho sản phẩm ${item.productId}`,
          );
        }

        // Check current inventory
        const inventoryRecord = await this.inventoryRepository.getBatchQuantity(
          storeWarehouseId,
          item.batchId,
        );

        if (!inventoryRecord) {
          throw new BadRequestException(
            `Không tìm thấy tồn kho cho batch ${item.batchId} tại kho cửa hàng`,
          );
        }

        const currentQty = parseFloat(inventoryRecord.quantity);
        if (currentQty < totalClaimedQty) {
          throw new BadRequestException(
            `Số lượng tồn kho không đủ. Hiện có: ${currentQty}, Yêu cầu: ${totalClaimedQty} (Batch ${item.batchId})`,
          );
        }

        // Evidence validation for damaged goods
        if (item.quantityDamaged > 0 && !item.imageProofUrl) {
          throw new BadRequestException(
            `Hàng hỏng bắt buộc phải có ảnh bằng chứng (Batch ${item.batchId})`,
          );
        }
      }

      // Step C: Action - Create claim and adjust inventory within transaction
      // C1: Create Claim
      const claim = await this.claimRepository.createClaim(
        dto.shipmentId,
        userId,
        tx,
      );

      // C2: Create Claim Items
      const claimItemsPayload = dto.items.map((item) => ({
        claimId: claim.id,
        productId: item.productId,
        quantityMissing: item.quantityMissing,
        quantityDamaged: item.quantityDamaged,
        reason: item.reason,
        imageUrl: item.imageProofUrl,
      }));

      await this.claimRepository.createClaimItems(claimItemsPayload, tx);

      // C3: Immediate Inventory Impact - Decrease store stock for claimed goods
      for (const item of dto.items) {
        const totalClaimedQty = item.quantityMissing + item.quantityDamaged;

        // Decrease inventory (negative adjustment)
        await this.inventoryRepository.adjustBatchQuantity(
          storeWarehouseId,
          item.batchId,
          -totalClaimedQty,
          tx,
        );

        // Log inventory transaction for audit trail
        await this.inventoryRepository.createInventoryTransaction(
          storeWarehouseId,
          item.batchId,
          'adjustment',
          -totalClaimedQty,
          claim.id,
          `Manual Claim: Missing: ${item.quantityMissing}, Damaged: ${item.quantityDamaged}`,
          tx,
        );
      }

      // C4: Update Order Status to CLAIMED
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
      throw new BadRequestException('Khiếu nại đã được xử lý');
    }

    return await this.claimRepository.updateClaimStatus(id, dto.status);
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
