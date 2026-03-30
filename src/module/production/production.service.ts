import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateBatchCode } from '../../common/utils/generate-batch-code.util';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { nowVn, parseToStartOfDayVn } from '../../common/time/vn-time';
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

  async createRecipe(input: {
    name: string;
    productId: number;
    standardOutput?: number;
    items: { materialId: number; quantity: number }[];
  }) {
    const output = await this.productRepo.findById(input.productId);
    if (!output || !output.isActive) {
      throw new NotFoundException('Thành phẩm (product) không tồn tại hoặc đã ngừng');
    }
    for (const line of input.items) {
      const m = await this.productRepo.findById(line.materialId);
      if (!m || !m.isActive) {
        throw new BadRequestException(
          `Nguyên liệu #${line.materialId} không tồn tại hoặc không còn hiệu lực`,
        );
      }
    }
    const std = input.standardOutput ?? 1;
    if (std <= 0) {
      throw new BadRequestException('standardOutput phải > 0');
    }
    return this.repo.createRecipe({
      name: input.name,
      productId: input.productId,
      standardOutput: String(std),
      items: input.items.map((i) => ({
        materialId: i.materialId,
        quantity: String(i.quantity),
      })),
    });
  }

  async createOrder(input: {
    recipeId: number;
    plannedQuantity: number;
    warehouseId: number;
    createdBy: string;
  }) {
    const recipe = await this.repo.findRecipeWithItems(input.recipeId);
    if (!recipe?.isActive) {
      throw new NotFoundException('Không tìm thấy công thức (recipe)');
    }
    const outputProduct = await this.productRepo.findById(recipe.outputProductId);
    if (!outputProduct || !outputProduct.isActive) {
      throw new BadRequestException('Thành phẩm theo công thức không còn hiệu lực');
    }
    if (!recipe.items?.length) {
      throw new BadRequestException('Công thức chưa có định mức nguyên liệu');
    }

    return this.uow.runInTransaction(async (tx) => {
      const code = await this.repo.generateNextProductionOrderCode(tx);
      return this.repo.createProductionOrder(
        {
          code,
          recipeId: input.recipeId,
          warehouseId: input.warehouseId,
          plannedQuantity: String(input.plannedQuantity),
          status: 'draft',
          createdBy: input.createdBy,
          kitchenStaffId: input.createdBy,
        },
        tx,
      );
    });
  }

  /** Bước 1–3: công thức, tồn, HSD — tạm giữ FEFO */
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
      const outputProduct = await this.productRepo.findById(recipe.outputProductId);
      if (!outputProduct || !outputProduct.isActive) {
        throw new BadRequestException('Thành phẩm không còn hiệu lực');
      }

      const std = parseFloat(String(recipe.standardOutput ?? '1'));
      if (std <= 0) {
        throw new BadRequestException('standardOutput của công thức không hợp lệ');
      }

      const outQty = parseFloat(String(order.plannedQuantity));
      const todayStr = nowVn().format('YYYY-MM-DD');

      for (const line of recipe.items) {
        const need =
          (parseFloat(String(line.quantityPerOutput)) * outQty) / std;
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

          const exp = String(row.batch.expiryDate);
          if (exp < todayStr) {
            throw new BadRequestException(
              `Lô ${row.batch.batchCode} đã hết hạn. Vui lòng xử lý lô hàng trước khi sản xuất.`,
            );
          }

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
            `Không đủ tồn nguyên liệu sản phẩm #${line.ingredientProductId} (còn thiếu ~${remaining.toFixed(4)})`,
          );
        }
      }

      await this.repo.markOrderStarted(tx, order.id);
      return { message: 'Đã tạm giữ nguyên liệu (FEFO), lệnh đang thực hiện' };
    });
  }

  /** Hoàn tất: trừ NL, lô TP, lineage, hao hụt / dư, log kho */
  async completeProduction(
    orderId: string,
    input: { actualQuantity: number; surplusNote?: string },
  ) {
    return this.uow.runInTransaction(async (tx) => {
      const order = await this.repo.findOrderById(tx, orderId);
      if (!order) throw new NotFoundException('Không tìm thấy lệnh sản xuất');
      if (order.status !== 'in_progress') {
        throw new BadRequestException('Lệnh phải đang chạy mới hoàn tất được');
      }

      const planned = parseFloat(String(order.plannedQuantity));
      const actual = input.actualQuantity;
      if (actual > planned && !input.surplusNote?.trim()) {
        throw new BadRequestException(
          'Sản lượng vượt định mức: cần surplusNote (giải trình)',
        );
      }

      const recipe = order.recipe;
      const outputProductId = recipe.outputProductId;
      const product = await this.productRepo.findById(outputProductId);
      if (!product) {
        throw new NotFoundException('Thành phẩm không tồn tại');
      }

      const loss = Math.max(0, planned - actual);
      const surplus = Math.max(0, actual - planned);

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

      await this.inboundRepo.lockBatchCodeGeneration(tx);
      let batchCode = generateBatchCode(product.sku);
      for (let i = 0; i < 12; i++) {
        const exists = await this.repo.findBatchByCode(tx, batchCode);
        if (!exists) break;
        batchCode = generateBatchCode(product.sku);
      }

      const mfg = nowVn().format('YYYY-MM-DD');
      let minParentExpiry: string | null = null;
      for (const res of order.reservations) {
        const b = res.batch;
        if (!b) continue;
        const e = String(b.expiryDate);
        if (!minParentExpiry || e < minParentExpiry) minParentExpiry = e;
      }
      const shelfCap = parseToStartOfDayVn(mfg)
        .add(product.shelfLifeDays, 'day')
        .format('YYYY-MM-DD');
      let expiryDate = shelfCap;
      if (minParentExpiry) {
        expiryDate = minParentExpiry < shelfCap ? minParentExpiry : shelfCap;
      }

      const batch = await this.inboundRepo.insertBatch(tx, {
        productId: outputProductId,
        batchCode,
        manufacturedDate: mfg,
        expiryDate,
      });

      await this.inboundRepo.updateBatchStatus(tx, batch.id, 'available');

      for (const res of order.reservations) {
        await this.repo.insertBatchLineage(tx, {
          parentBatchId: res.batchId,
          childBatchId: batch.id,
          productionOrderId: order.id,
          consumedQuantity: String(res.reservedQuantity),
        });
      }

      await this.inboundRepo.upsertInventory(
        tx,
        order.warehouseId,
        batch.id,
        actual.toString(),
      );

      await this.inventoryRepo.createInventoryTransaction(
        order.warehouseId,
        batch.id,
        'production_output',
        planned,
        `PRODUCTION:${orderId}`,
        'Thành phẩm theo định mức (lý thuyết)',
        tx,
      );

      if (loss > 0.0001) {
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          batch.id,
          'adjustment',
          -loss,
          `PRODUCTION:${orderId}`,
          'PRODUCTION_LOSS',
          tx,
        );
      }
      if (surplus > 0.0001) {
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          batch.id,
          'adjustment',
          surplus,
          `PRODUCTION:${orderId}`,
          `PRODUCTION_SURPLUS:${input.surplusNote ?? ''}`,
          tx,
        );
      }

      await this.repo.markOrderCompleted(tx, order.id, String(actual));

      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
        plannedQuantity: planned,
        actualQuantity: actual,
        lossQuantity: loss > 0.0001 ? loss : 0,
        surplusQuantity: surplus > 0.0001 ? surplus : 0,
      };
    });
  }
}
