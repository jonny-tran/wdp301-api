import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { oneRelation } from '../../common/drizzle/query-helpers';
import { generateInboundBatchCode } from '../../common/utils/generate-batch-code.util';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { nowVn, parseToStartOfDayVn } from '../../common/time/vn-time';
import { UnitOfWork } from '../../database/unit-of-work';
import { UserRole } from '../auth/dto/create-user.dto';
import { InboundRepository } from '../inbound/inbound.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { ProductType } from '../product/constants/product-type.enum';
import { ProductRepository } from '../product/product.repository';
import { GetProductionOrdersQueryDto } from './dto/get-production-orders-query.dto';
import { GetRecipesQueryDto } from './dto/get-recipes-query.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { PRODUCTION_SURPLUS_APPROVAL_RATIO } from './production.constants';
import { ProductionRepository } from './production.repository';
import {
  enrichInventoryTransactionsWithProductBaseUnit,
  enrichProductionOrderDetail,
  enrichRecipeForResponse,
  enrichRecipeOutputProductOnly,
} from './utils/enrich-product-base-unit.util';
import {
  fromDbDecimal,
  hasMaterialRemaining,
  isLossPositive,
  isPositivePlannedQuantity,
  isSurplusPositive,
} from './utils/production-decimal.util';

/** Lô nguyên liệu (kèm product) dùng cho salvage — đồng bộ với findBatchById. */
type SalvageInputBatch = NonNullable<
  Awaited<ReturnType<ProductionRepository['findBatchById']>>
>;

@Injectable()
export class ProductionService {
  constructor(
    private readonly repo: ProductionRepository,
    private readonly uow: UnitOfWork,
    private readonly inboundRepo: InboundRepository,
    private readonly productRepo: ProductRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly inventoryService: InventoryService,
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
    const created = await this.repo.createRecipe({
      name: output.name,
      productId: input.productId,
      items: input.items.map((i) => ({
        productId: i.productId,
        quantity: String(i.quantity),
      })),
    });
    if (!created) {
      throw new NotFoundException('Không tạo được công thức');
    }
    return enrichRecipeForResponse(created as Record<string, unknown>);
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
    return enrichRecipeForResponse(recipe as Record<string, unknown>);
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

    const updated = await this.repo.updateRecipe(recipeId, {
      outputProductId:
        dto.productId !== undefined ? nextOutputId : undefined,
      name: dto.productId !== undefined ? nextName : undefined,
      isActive: dto.isActive,
      items: itemsPayload,
    });
    if (!updated) {
      throw new NotFoundException('Không tìm thấy công thức');
    }
    return enrichRecipeForResponse(updated as Record<string, unknown>);
  }

  /** Soft-delete: `is_active = false`. */
  async softDeleteRecipe(recipeId: number) {
    return this.updateRecipe(recipeId, { isActive: false });
  }

  async listProductionOrders(query: GetProductionOrdersQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { items, meta } = await this.repo.listProductionOrdersPaged({
      page,
      limit,
      status: query.status,
    });
    return {
      items: items.map((row) => ({
        ...row,
        recipe: row.recipe
          ? enrichRecipeOutputProductOnly(row.recipe as Record<string, unknown>)
          : row.recipe,
      })),
      meta,
    };
  }

  async getProductionOrderById(id: string) {
    const order = await this.repo.findProductionOrderDetailById(id);
    if (!order) {
      throw new NotFoundException('Không tìm thấy lệnh sản xuất');
    }
    const ref = `PRODUCTION:${id}`;
    const inventoryTransactions =
      await this.inventoryRepo.listTransactionsByReferenceId(ref);
    const base = enrichProductionOrderDetail(
      order as unknown as Record<string, unknown>,
    );
    return {
      ...base,
      inventoryTransactions: enrichInventoryTransactionsWithProductBaseUnit(
        inventoryTransactions as unknown as Record<string, unknown>[],
      ),
    };
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
          productionType: 'standard',
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
      if (order.productionType === 'salvage') {
        throw new BadRequestException(
          'Lệnh salvage đã giữ chỗ khi tạo; không gọi start (FEFO).',
        );
      }
      if (order.status !== 'draft') {
        throw new BadRequestException('Lệnh không ở trạng thái nháp');
      }
      const recipe = await this.repo.findRecipeWithItems(order.recipeId, tx);
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
      if (order.productionType === 'salvage') {
        throw new BadRequestException(
          'Lệnh salvage: dùng POST /production/salvage/:id/complete.',
        );
      }
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

      const recipe = await this.repo.findRecipeWithItems(order.recipeId, tx);
      if (!recipe) {
        throw new NotFoundException('Không tìm thấy công thức của lệnh sản xuất');
      }
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

  /**
   * Salvage: giữ chỗ đúng một lô NL + tạo lệnh in_progress (không FEFO).
   * Yêu cầu BOM **một dòng** nguyên liệu trùng `product_id` của lô chỉ định.
   */
  async createSalvageProductionOrder(input: {
    inputBatchId: number;
    recipeId: number;
    quantityToConsume: number;
    warehouseId: number;
    createdBy: string;
  }) {
    const qtyDec = new Decimal(input.quantityToConsume);
    if (!qtyDec.gt(0)) {
      throw new BadRequestException('quantityToConsume phải lớn hơn 0.');
    }

    return this.uow.runInTransaction(async (tx) => {
      const recipe = await this.repo.findRecipeWithItems(input.recipeId, tx);
      if (!recipe) {
        throw new NotFoundException('Không tìm thấy công thức');
      }
      if (!recipe.isActive) {
        throw new BadRequestException('Công thức không còn hoạt động');
      }
      const items = recipe.items ?? [];
      if (items.length !== 1) {
        throw new BadRequestException(
          'Salvage chỉ hỗ trợ công thức **một** nguyên liệu (một dòng BOM).',
        );
      }
      const ingredientLine = items[0]!;
      const outputProduct = await this.productRepo.findById(recipe.outputProductId);
      if (!outputProduct?.isActive) {
        throw new NotFoundException('Thành phẩm không tồn tại hoặc đã ngừng');
      }
      if (outputProduct.type !== ProductType.FINISHED_GOOD) {
        throw new BadRequestException(
          'Công thức phải cho ra thành phẩm loại finished_good.',
        );
      }

      const inputBatch = await this.repo.findBatchById(tx, input.inputBatchId);
      if (!inputBatch) {
        throw new NotFoundException('Không tìm thấy lô nguyên liệu');
      }
      if (inputBatch.productId !== ingredientLine.ingredientProductId) {
        throw new BadRequestException(
          'Lô không khớp nguyên liệu trong công thức đã chọn.',
        );
      }

      const todayStr = nowVn().format('YYYY-MM-DD');
      if (String(inputBatch.expiryDate) < todayStr) {
        throw new BadRequestException(
          'Lô đã quá hạn sử dụng — không thể tạo lệnh salvage.',
        );
      }

      await this.inventoryService.lockSpecificBatch(
        input.warehouseId,
        input.inputBatchId,
        qtyDec.toNumber(),
        tx,
      );

      const code = await this.repo.generateNextProductionOrderCode(tx);
      const order = await this.repo.createProductionOrder(
        {
          code,
          recipeId: recipe.id,
          warehouseId: input.warehouseId,
          plannedQuantity: qtyDec.toFixed(4),
          status: 'in_progress',
          productionType: 'salvage',
          inputBatchId: input.inputBatchId,
          createdBy: input.createdBy,
          kitchenStaffId: input.createdBy,
          startedAt: new Date(),
        },
        tx,
      );

      await this.repo.insertReservation(tx, {
        productionOrderId: order.id,
        batchId: input.inputBatchId,
        reservedQuantity: qtyDec.toFixed(4),
      });

      return {
        orderId: order.id,
        code: order.code,
        productionType: order.productionType,
        inputBatchId: input.inputBatchId,
        quantityReserved: qtyDec.toFixed(4),
        recipeId: recipe.id,
        outputProductId: recipe.outputProductId,
      };
    });
  }

  /**
   * Hoàn tất salvage: trừ đúng lô đã giữ, nhập lô TP mới, lineage, giao dịch kho.
   * `plannedQuantity` trên lệnh = khối lượng NL đã tiêu thụ; sản lượng TP lý thuyết = NL / quantityPerOutput.
   */
  async completeSalvageProduction(
    orderId: string,
    input: {
      actualYield: number;
      surplusNote?: string;
      callerRole?: string;
    },
  ) {
    return this.uow.runInTransaction(async (tx) => {
      const order = await this.repo.findOrderById(tx, orderId);
      if (!order) {
        throw new NotFoundException('Không tìm thấy lệnh sản xuất');
      }
      if (order.productionType !== 'salvage') {
        throw new BadRequestException('Đây không phải lệnh salvage.');
      }
      if (order.status !== 'in_progress') {
        throw new BadRequestException('Lệnh salvage phải đang thực hiện.');
      }
      if (order.inputBatchId == null) {
        throw new BadRequestException('Thiếu input_batch_id trên lệnh salvage.');
      }

      const recipe = await this.repo.findRecipeWithItems(order.recipeId, tx);
      if (!recipe?.items?.length || recipe.items.length !== 1) {
        throw new BadRequestException('Công thức salvage không hợp lệ.');
      }
      const ingredientLine = recipe.items[0]!;
      const resv = order.reservations?.[0];
      if (!resv || resv.batchId !== order.inputBatchId) {
        throw new BadRequestException(
          'Thiếu reservation khớp lô salvage — dữ liệu không nhất quán.',
        );
      }

      const consumed = new Decimal(order.plannedQuantity);
      const qPerOut = new Decimal(String(ingredientLine.quantityPerOutput));
      if (!qPerOut.gt(0)) {
        throw new BadRequestException('Định mức quantityPerOutput không hợp lệ.');
      }
      const expectedTp = consumed.div(qPerOut);
      const actualTp = new Decimal(input.actualYield);
      if (!actualTp.gt(0)) {
        throw new BadRequestException('actualYield phải lớn hơn 0.');
      }

      const expectedNum = expectedTp.toNumber();
      const actualNum = actualTp.toNumber();
      const maxAllowedWithoutManager =
        expectedNum * (1 + PRODUCTION_SURPLUS_APPROVAL_RATIO);
      if (
        actualNum > maxAllowedWithoutManager &&
        !ProductionService.canApproveHighSurplus(input.callerRole)
      ) {
        throw new BadRequestException(
          `Sản lượng thực tế vượt quá ${Math.round(PRODUCTION_SURPLUS_APPROVAL_RATIO * 100)}% so với định mức lý thuyết (${expectedNum.toFixed(4)}). ` +
            `Chỉ quản lý hoặc admin mới ghi nhận mức dư lớn như vậy.`,
        );
      }
      if (actualNum > expectedNum && !input.surplusNote?.trim()) {
        throw new BadRequestException(
          'Vượt định mức lý thuyết: bắt buộc nhập surplusNote (giải trình).',
        );
      }

      await this.inventoryRepo.deductStockFromSpecificBatch(
        order.warehouseId,
        order.inputBatchId,
        consumed.toNumber(),
        tx,
      );

      const inputBatchRaw =
        order.inputBatch ?? (await this.repo.findBatchById(tx, order.inputBatchId));
      const inputBatch = oneRelation<SalvageInputBatch>(inputBatchRaw);
      if (!inputBatch) {
        throw new NotFoundException('Không tìm thấy lô nguyên liệu');
      }

      await this.inventoryRepo.createInventoryTransaction(
        order.warehouseId,
        order.inputBatchId,
        'production_consume',
        -consumed.toNumber(),
        `PRODUCTION:${orderId}`,
        'Salvage: tiêu hao nguyên liệu (lô chỉ định)',
        tx,
      );
      await this.inventoryRepo.syncBatchTotalsFromInventory(tx, order.inputBatchId);

      const outputProduct = await this.productRepo.findById(recipe.outputProductId);
      if (!outputProduct) {
        throw new NotFoundException('Thành phẩm không tồn tại');
      }

      const parentUnit = inputBatch.unitCostAtImport
        ? new Decimal(String(inputBatch.unitCostAtImport))
        : null;
      const childUnitCost =
        parentUnit && actualTp.gt(0)
          ? parentUnit.mul(consumed).div(actualTp).toFixed(4)
          : null;

      await this.inboundRepo.lockBatchCodeGeneration(tx);
      let batchCode = generateInboundBatchCode(outputProduct.sku);
      for (let i = 0; i < 24; i++) {
        const exists = await this.repo.findBatchByCode(tx, batchCode);
        if (!exists) break;
        batchCode = generateInboundBatchCode(outputProduct.sku);
      }

      const mfg = nowVn().format('YYYY-MM-DD');
      const expiryDate = this.calculateFinishedGoodExpiry({
        manufacturedDateYmd: mfg,
        shelfLifeDays: outputProduct.shelfLifeDays,
        parentExpiryYmds: [String(inputBatch.expiryDate)],
      });

      const childBatch = await this.inboundRepo.insertBatch(tx, {
        productId: recipe.outputProductId,
        batchCode,
        manufacturedDate: mfg,
        expiryDate,
        unitCostAtImport: childUnitCost,
      });
      if (!childBatch) {
        throw new InternalServerErrorException('Không tạo được lô thành phẩm');
      }

      await this.inboundRepo.updateBatchStatus(tx, childBatch.id, 'available');

      await this.repo.insertBatchLineage(tx, {
        parentBatchId: order.inputBatchId,
        childBatchId: childBatch.id,
        productionOrderId: order.id,
        consumedQuantity: consumed.toFixed(4),
      });

      await this.inboundRepo.upsertInventory(
        tx,
        order.warehouseId,
        childBatch.id,
        actualTp.toFixed(4),
      );
      await this.inventoryRepo.syncBatchTotalsFromInventory(tx, childBatch.id);

      await this.inventoryRepo.createInventoryTransaction(
        order.warehouseId,
        childBatch.id,
        'production_output',
        actualNum,
        `PRODUCTION:${orderId}`,
        'Salvage: nhập thành phẩm (production output)',
        tx,
      );

      const lossDec = expectedTp.minus(actualTp);
      const loss = lossDec.gt(0) ? lossDec.toNumber() : 0;
      const surplusDec = actualTp.minus(expectedTp);
      const surplus = surplusDec.gt(0) ? surplusDec.toNumber() : 0;

      if (isLossPositive(loss)) {
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          childBatch.id,
          'waste',
          -loss,
          `PRODUCTION:${orderId}`,
          'PRODUCTION_LOSS (salvage yield)',
          tx,
        );
      }
      if (isSurplusPositive(surplus)) {
        const trimmedNote = input.surplusNote?.trim() ?? '';
        const surplusReason = `PRODUCTION_SURPLUS | ${trimmedNote}`;
        await this.inventoryRepo.createInventoryTransaction(
          order.warehouseId,
          childBatch.id,
          'adjustment',
          surplus,
          `PRODUCTION:${orderId}`,
          surplusReason,
          tx,
        );
      }

      await this.repo.markOrderCompleted(tx, order.id, actualTp.toFixed(4));

      return {
        batchId: childBatch.id,
        batchCode: childBatch.batchCode,
        expectedYieldTheoretical: expectedNum,
        actualYield: actualNum,
        lossQuantity: isLossPositive(loss) ? loss : 0,
        surplusQuantity: isSurplusPositive(surplus) ? surplus : 0,
        unitCostAtImport: childUnitCost,
      };
    });
  }
}
