import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateInboundBatchCode } from '../../common/utils/generate-batch-code.util';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { nowVn, parseToStartOfDayVn } from '../../common/time/vn-time';
import { UnitOfWork } from '../../database/unit-of-work';
import { UserRole } from '../auth/dto/create-user.dto';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProductType } from '../product/constants/product-type.enum';
import { ProductRepository } from '../product/product.repository';
import { GetProductionOrdersQueryDto } from './dto/get-production-orders-query.dto';
import { GetRecipesQueryDto } from './dto/get-recipes-query.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
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

  /** Kiểm tra từng dòng BOM: raw_material, không trùng thành phẩm. */
  private async assertBomIngredientLines(
    outputProductId: number,
    items: { productId: number; quantity: number }[],
  ) {
    for (const line of items) {
      if (line.productId === outputProductId) {
        throw new BadRequestException(
          'Nguyên liệu không được trùng với thành phẩm đầu ra',
        );
      }
      const m = await this.productRepo.findById(line.productId);
      if (!m || !m.isActive) {
        throw new BadRequestException(
          `Nguyên liệu #${line.productId} không tồn tại hoặc không còn hiệu lực`,
        );
      }
      if (m.type !== ProductType.RAW_MATERIAL) {
        throw new BadRequestException(
          `Nguyên liệu #${line.productId} phải là raw_material`,
        );
      }
    }
  }

  async createRecipe(input: {
    productId: number;
    items: { productId: number; quantity: number }[];
  }) {
    const output = await this.productRepo.findById(input.productId);
    if (!output || !output.isActive) {
      throw new NotFoundException('Thành phẩm (product) không tồn tại hoặc đã ngừng');
    }
    if (output.type !== ProductType.FINISHED_GOOD) {
      throw new BadRequestException(
        'Thành phẩm đầu ra phải có loại finished_good',
      );
    }
    await this.assertBomIngredientLines(input.productId, input.items);
    return this.repo.createRecipe({
      name: output.name,
      productId: input.productId,
      items: input.items.map((i) => ({
        productId: i.productId,
        quantity: String(i.quantity),
      })),
    });
  }

  async listRecipes(query: GetRecipesQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    return this.repo.listRecipesPaged({
      page,
      limit,
      search: query.search,
      isActive: query.isActive,
    });
  }

  async getRecipeById(id: number) {
    const recipe = await this.repo.findRecipeDetail(id);
    if (!recipe) {
      throw new NotFoundException('Không tìm thấy công thức');
    }
    return recipe;
  }

  async updateRecipe(recipeId: number, dto: UpdateRecipeDto) {
    if (
      dto.productId === undefined &&
      dto.items === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException('Không có trường nào để cập nhật');
    }

    const existing = await this.repo.findRecipeDetail(recipeId);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy công thức');
    }

    const structuralChange =
      dto.productId !== undefined || dto.items !== undefined;
    if (structuralChange) {
      const blocking = await this.repo.countBlockingOrdersForRecipe(recipeId);
      if (blocking > 0) {
        throw new BadRequestException(
          'Công thức đang gắn lệnh sản xuất nháp hoặc đang chạy; không thể đổi thành phẩm hoặc định mức.',
        );
      }
    }

    let nextOutputId = existing.outputProductId;
    let nextName: string | undefined;

    if (dto.productId !== undefined) {
      const output = await this.productRepo.findById(dto.productId);
      if (!output?.isActive) {
        throw new NotFoundException('Thành phẩm không tồn tại hoặc đã ngừng');
      }
      if (output.type !== ProductType.FINISHED_GOOD) {
        throw new BadRequestException(
          'Thành phẩm đầu ra phải có loại finished_good',
        );
      }
      const willBeActive = dto.isActive ?? existing.isActive;
      if (willBeActive) {
        const dup = await this.repo.countOtherActiveRecipesForProduct(
          dto.productId,
          recipeId,
        );
        if (dup > 0) {
          throw new BadRequestException(
            'Đã có công thức active khác cho thành phẩm này; chỉ được giữ một BOM active.',
          );
        }
      }
      nextOutputId = dto.productId;
      nextName = output.name;
    }

    if (dto.isActive === true && !existing.isActive) {
      const dup = await this.repo.countOtherActiveRecipesForProduct(
        nextOutputId,
        recipeId,
      );
      if (dup > 0) {
        throw new BadRequestException(
          'Đã có công thức active khác cho cùng thành phẩm; không thể bật lại công thức này.',
        );
      }
    }

    const itemsToValidate = dto.items ?? [];
    if (dto.items !== undefined) {
      await this.assertBomIngredientLines(nextOutputId, itemsToValidate);
    }

    const itemsPayload = dto.items
      ? dto.items.map((i) => ({
          productId: i.productId,
          quantity: String(i.quantity),
        }))
      : undefined;

    return this.repo.updateRecipe(recipeId, {
      outputProductId:
        dto.productId !== undefined ? nextOutputId : undefined,
      name: dto.productId !== undefined ? nextName : undefined,
      isActive: dto.isActive,
      items: itemsPayload,
    });
  }

  /** Soft-delete: `is_active = false`. */
  async softDeleteRecipe(recipeId: number) {
    return this.updateRecipe(recipeId, { isActive: false });
  }

  async listProductionOrders(query: GetProductionOrdersQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    return this.repo.listProductionOrdersPaged({
      page,
      limit,
      status: query.status,
    });
  }

  async getProductionOrderById(id: string) {
    const order = await this.repo.findProductionOrderDetailById(id);
    if (!order) {
      throw new NotFoundException('Không tìm thấy lệnh sản xuất');
    }
    const ref = `PRODUCTION:${id}`;
    const inventoryTransactions =
      await this.inventoryRepo.listTransactionsByReferenceId(ref);
    return { ...order, inventoryTransactions };
  }

  async createOrder(input: {
    productId: number;
    plannedQuantity: number;
    warehouseId: number;
    createdBy: string;
  }) {
    if (!isPositivePlannedQuantity(input.plannedQuantity)) {
      throw new BadRequestException(
        'Số lượng dự kiến (plannedQuantity) phải lớn hơn 0.',
      );
    }

    const outputProduct = await this.productRepo.findById(input.productId);
    if (!outputProduct?.isActive) {
      throw new NotFoundException('Thành phẩm không tồn tại hoặc đã ngừng');
    }
    if (outputProduct.type !== ProductType.FINISHED_GOOD) {
      throw new BadRequestException(
        'Chỉ được tạo lệnh sản xuất cho sản phẩm loại finished_good.',
      );
    }

    const recipes = await this.repo.findActiveRecipesByOutputProductId(
      input.productId,
    );
    if (recipes.length === 0) {
      throw new NotFoundException(
        'Chưa có công thức đang hoạt động cho thành phẩm này',
      );
    }
    if (recipes.length > 1) {
      throw new BadRequestException(
        'Có nhiều công thức active cho cùng một thành phẩm; vui lòng chỉ giữ một BOM active.',
      );
    }
    const recipe = recipes[0];
    if (!recipe.items?.length) {
      throw new BadRequestException('Công thức chưa có định mức nguyên liệu');
    }

    return this.uow.runInTransaction(async (tx) => {
      const code = await this.repo.generateNextProductionOrderCode(tx);
      return this.repo.createProductionOrder(
        {
          code,
          recipeId: recipe.id,
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
      if (outputProduct.type !== ProductType.FINISHED_GOOD) {
        throw new BadRequestException(
          'Thành phẩm theo công thức phải là finished_good',
        );
      }

      const outQty = fromDbDecimal(order.plannedQuantity);
      if (!isPositivePlannedQuantity(outQty)) {
        throw new BadRequestException(
          'Số lượng dự kiến trên lệnh không hợp lệ (≤ 0). Không thể bắt đầu sản xuất.',
        );
      }

      const todayStr = nowVn().format('YYYY-MM-DD');

      for (const line of recipe.items) {
        const need = fromDbDecimal(line.quantityPerOutput) * outQty;
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
      if (product.type !== ProductType.FINISHED_GOOD) {
        throw new BadRequestException(
          'Thành phẩm sản xuất phải là finished_good',
        );
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
        await this.inventoryRepo.syncBatchTotalsFromInventory(
          tx,
          res.batchId,
        );
      }

      await this.inboundRepo.lockBatchCodeGeneration(tx);
      let batchCode = generateInboundBatchCode(product.sku);
      for (let i = 0; i < 24; i++) {
        const exists = await this.repo.findBatchByCode(tx, batchCode);
        if (!exists) break;
        batchCode = generateInboundBatchCode(product.sku);
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

      await this.inventoryRepo.syncBatchTotalsFromInventory(tx, batch.id);

      await this.inventoryRepo.createInventoryTransaction(
        order.warehouseId,
        batch.id,
        'production_output',
        actual,
        `PRODUCTION:${orderId}`,
        'Nhập kho nội bộ thành phẩm (production output)',
        tx,
      );

      if (isLossPositive(loss)) {
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          batch.id,
          'waste',
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
