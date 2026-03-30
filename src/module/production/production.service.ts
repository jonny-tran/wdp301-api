import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateBatchCode } from '../../common/utils/generate-batch-code.util';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { nowVn, parseToStartOfDayVn } from '../../common/time/vn-time';
import { UnitOfWork } from '../../database/unit-of-work';
import { UserRole } from '../auth/dto/create-user.dto';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProductRepository } from '../product/product.repository';
import { PRODUCTION_SURPLUS_APPROVAL_RATIO } from './production.constants';
import { ProductionRepository } from './production.repository';
import {
  fromDbDecimal,
  hasMaterialRemaining,
  isLossPositive,
  isPositivePlannedQuantity,
  isSurplusPositive,
} from './utils/production-decimal.util';

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
    if (!isPositivePlannedQuantity(input.plannedQuantity)) {
      throw new BadRequestException(
        'Số lượng dự kiến (plannedQuantity) phải lớn hơn 0.',
      );
    }

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

      const std = fromDbDecimal(recipe.standardOutput ?? '1');
      if (std <= 0) {
        throw new BadRequestException('standardOutput của công thức không hợp lệ');
      }

      const outQty = fromDbDecimal(order.plannedQuantity);
      if (!isPositivePlannedQuantity(outQty)) {
        throw new BadRequestException(
          'Số lượng dự kiến trên lệnh không hợp lệ (≤ 0). Không thể bắt đầu sản xuất.',
        );
      }

      const todayStr = nowVn().format('YYYY-MM-DD');

      for (const line of recipe.items) {
        const need =
          (fromDbDecimal(line.quantityPerOutput) * outQty) / std;
        let remaining = need;
        const rows = await this.repo.listAvailableInventoryFefo(
          tx,
          order.warehouseId,
          line.ingredientProductId,
        );

        for (const row of rows) {
          if (!hasMaterialRemaining(remaining)) break;
          const phys = fromDbDecimal(row.inventory.quantity);
          const res = fromDbDecimal(row.inventory.reservedQuantity);
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

        if (hasMaterialRemaining(remaining)) {
          throw new InsufficientStockException(
            `Không đủ tồn khả dụng cho nguyên liệu (mã sản phẩm #${line.ingredientProductId}) tại kho lệnh. ` +
              `Theo định mức (FEFO) vẫn còn thiếu khoảng ${remaining.toFixed(4)} đơn vị so với nhu cầu. ` +
              `Hãy nhập thêm hàng, điều chỉnh plannedQuantity hoặc kiểm tra các lô hết hạn đã được xử lý chưa.`,
          );
        }
      }

      await this.repo.markOrderStarted(tx, order.id);
      return { message: 'Đã tạm giữ nguyên liệu (FEFO), lệnh đang thực hiện' };
    });
  }

  /**
   * HSD thành phẩm: không lấy HSD sau ngày “cap” theo shelf life từ NSX;
   * không lấy sau HSD nguyên liệu đầu vào (truy xuất).
   */
  private calculateFinishedGoodExpiry(params: {
    manufacturedDateYmd: string;
    shelfLifeDays: number;
    parentExpiryYmds: string[];
  }): string {
    const shelfCap = parseToStartOfDayVn(params.manufacturedDateYmd)
      .add(params.shelfLifeDays, 'day')
      .format('YYYY-MM-DD');

    let minParent: string | null = null;
    for (const e of params.parentExpiryYmds) {
      if (!minParent || e < minParent) minParent = e;
    }

    if (!minParent) return shelfCap;
    return minParent < shelfCap ? minParent : shelfCap;
  }

  private static canApproveHighSurplus(callerRole?: string): boolean {
    if (!callerRole) return false;
    return (
      callerRole === UserRole.MANAGER || callerRole === UserRole.ADMIN
    );
  }

  /** Hoàn tất: trừ NL, lô TP, lineage, hao hụt / dư, log kho */
  async completeProduction(
    orderId: string,
    input: {
      actualQuantity: number;
      surplusNote?: string;
      callerRole?: string;
    },
  ) {
    return this.uow.runInTransaction(async (tx) => {
      const order = await this.repo.findOrderById(tx, orderId);
      if (!order) throw new NotFoundException('Không tìm thấy lệnh sản xuất');
      if (order.status !== 'in_progress') {
        throw new BadRequestException('Lệnh phải đang chạy mới hoàn tất được');
      }

      const planned = fromDbDecimal(order.plannedQuantity);
      if (!isPositivePlannedQuantity(planned)) {
        throw new BadRequestException(
          'Định mức trên lệnh không hợp lệ; không thể hoàn tất.',
        );
      }

      const actual = input.actualQuantity;
      if (!isPositivePlannedQuantity(actual)) {
        throw new BadRequestException(
          'Sản lượng thực tế phải lớn hơn 0.',
        );
      }

      const maxAllowedWithoutManager =
        planned * (1 + PRODUCTION_SURPLUS_APPROVAL_RATIO);
      if (
        actual > maxAllowedWithoutManager &&
        !ProductionService.canApproveHighSurplus(input.callerRole)
      ) {
        throw new BadRequestException(
          `Sản lượng thực tế vượt quá ${Math.round(PRODUCTION_SURPLUS_APPROVAL_RATIO * 100)}% so với định mức (${planned}). ` +
            `Chỉ tài khoản quản lý hoặc admin mới được ghi nhận mức dư lớn như vậy.`,
        );
      }

      if (actual > planned && !input.surplusNote?.trim()) {
        throw new BadRequestException(
          'Sản lượng vượt định mức: bắt buộc nhập surplusNote (giải trình).',
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
        const qty = fromDbDecimal(res.reservedQuantity);
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
      const parentExpiries: string[] = [];
      for (const res of order.reservations) {
        const b = res.batch;
        if (!b) continue;
        parentExpiries.push(String(b.expiryDate));
      }

      const expiryDate = this.calculateFinishedGoodExpiry({
        manufacturedDateYmd: mfg,
        shelfLifeDays: product.shelfLifeDays,
        parentExpiryYmds: parentExpiries,
      });

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
        'Thành phẩm theo định mức đầy đủ (planned) — nền cho đối soát hao hụt/dư',
        tx,
      );

      if (isLossPositive(loss)) {
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
      if (isSurplusPositive(surplus)) {
        const trimmedNote = input.surplusNote?.trim() ?? '';
        const surplusReason = `PRODUCTION_SURPLUS | ${trimmedNote}`;
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          batch.id,
          'adjustment',
          surplus,
          `PRODUCTION:${orderId}`,
          surplusReason,
          tx,
        );
      }

      await this.repo.markOrderCompleted(tx, order.id, String(actual));

      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
        plannedQuantity: planned,
        actualQuantity: actual,
        lossQuantity: isLossPositive(loss) ? loss : 0,
        surplusQuantity: isSurplusPositive(surplus) ? surplus : 0,
      };
    });
  }
}
