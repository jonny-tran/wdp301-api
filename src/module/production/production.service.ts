import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { nowVn } from '../../common/time/vn-time';
import { UnitOfWork } from '../../database/unit-of-work';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProductRepository } from '../product/product.repository';
import { ProductionRepository } from './production.repository';

@Injectable()
export class ProductionService {
  constructor(
    private readonly repo: ProductionRepository,
    private readonly uow: UnitOfWork,
    private readonly inboundRepo: InboundRepository,
    private readonly productRepo: ProductRepository,
    private readonly inventoryRepo: InventoryRepository,
  ) {}

  async createOrder(input: {
    recipeId: number;
    outputQuantity: number;
    warehouseId: number;
    createdBy: string;
  }) {
    const recipe = await this.repo.findRecipeWithItems(input.recipeId);
    if (!recipe?.isActive) {
      throw new NotFoundException('Không tìm thấy công thức (recipe)');
    }
    return this.repo.createProductionOrder({
      recipeId: input.recipeId,
      warehouseId: input.warehouseId,
      outputQuantity: String(input.outputQuantity),
      status: 'draft',
      createdBy: input.createdBy,
    });
  }

  /** Tạm giữ nguyên liệu theo FEFO */
  async startProduction(orderId: string) {
    return this.uow.runInTransaction(async (tx) => {
      const order = await this.repo.findOrderById(tx, orderId);
      if (!order) throw new NotFoundException('Không tìm thấy lệnh sản xuất');
      if (order.status !== 'draft') {
        throw new BadRequestException('Lệnh không ở trạng thái nháp');
      }
      const recipe = order.recipe;
      if (!recipe?.items?.length) {
        throw new BadRequestException('Công thức không có nguyên liệu');
      }

      const outQty = parseFloat(String(order.outputQuantity));

      for (const line of recipe.items) {
        const need =
          parseFloat(String(line.quantityPerOutput)) * outQty;
        let remaining = need;
        const rows = await this.repo.listAvailableInventoryFefo(
          tx,
          order.warehouseId,
          line.ingredientProductId,
        );

        for (const row of rows) {
          if (remaining <= 0) break;
          const phys = parseFloat(String(row.inventory.quantity));
          const res = parseFloat(String(row.inventory.reservedQuantity));
          const avail = phys - res;
          if (avail <= 0) continue;
          const take = Math.min(avail, remaining);
          await this.repo.updateReservedQuantity(tx, row.inventory.id, take);
          await this.repo.insertReservation(tx, {
            productionOrderId: order.id,
            batchId: row.batch.id,
            reservedQuantity: take.toString(),
          });
          remaining -= take;
        }

        if (remaining > 0.0001) {
          throw new InsufficientStockException(
            `Không đủ tồn nguyên liệu sản phẩm #${line.ingredientProductId}`,
          );
        }
      }

      await this.repo.updateOrderStatus(tx, order.id, 'in_progress');
      return { message: 'Đã tạm giữ nguyên liệu (FEFO)' };
    });
  }

  /** Trừ nguyên liệu, tạo lô thành phẩm, ghi log */
  async finishProduction(orderId: string) {
    return this.uow.runInTransaction(async (tx) => {
      const order = await this.repo.findOrderById(tx, orderId);
      if (!order) throw new NotFoundException('Không tìm thấy lệnh sản xuất');
      if (order.status !== 'in_progress') {
        throw new BadRequestException('Lệnh phải đang chạy mới hoàn tất được');
      }

      const recipe = order.recipe;
      const outputProductId = recipe.outputProductId;
      const product = await this.productRepo.findById(outputProductId);
      if (!product) {
        throw new NotFoundException('Thành phẩm không tồn tại');
      }

      for (const res of order.reservations) {
        const qty = parseFloat(String(res.reservedQuantity));
        await this.repo.decreaseStockAndReserved(
          tx,
          order.warehouseId,
          res.batchId,
          qty,
        );
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          res.batchId,
          'production_consume',
          -qty,
          `PRODUCTION:${orderId}`,
          'Tiêu hao nguyên liệu sản xuất',
          tx,
        );
      }

      const batchCode = await this.inboundRepo.nextBatchCode(tx, product.sku);
      const mfg = nowVn().format('YYYY-MM-DD');
      const exp = nowVn().add(product.shelfLifeDays, 'day').format('YYYY-MM-DD');

      const batch = await this.inboundRepo.insertBatch(tx, {
        productId: outputProductId,
        batchCode,
        manufacturedDate: mfg,
        expiryDate: exp,
      });

      await this.inboundRepo.updateBatchStatus(tx, batch.id, 'available');

      const outQty = parseFloat(String(order.outputQuantity));
      await this.inboundRepo.upsertInventory(
        tx,
        order.warehouseId,
        batch.id,
        outQty.toString(),
      );
      await this.inventoryRepo.createInventoryTransaction(
        order.warehouseId,
        batch.id,
        'production_output',
        outQty,
        `PRODUCTION:${orderId}`,
        'Thành phẩm sau sản xuất',
        tx,
      );

      await this.repo.updateOrderStatus(tx, order.id, 'completed');
      return { batchId: batch.id, batchCode: batch.batchCode };
    });
  }
}
