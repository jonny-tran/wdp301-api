import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.constants';
import * as schema from 'src/database/schema';
import { OrderStatus } from '../order/constants/order-status.enum';
import { FinalizeShipmentDto, ReportIssueDto } from './dto/warehouse-ops.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // =================================================================
  // INTERNAL: Tạo kho mặc định cho Store (Transactional)
  // =================================================================
  async createDefaultWarehouse(
    storeId: string,
    storeName: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    const db = tx ?? this.db;
    const warehouseName = `Kho mặc định - ${storeName}`;

    const [warehouse] = await db
      .insert(schema.warehouses)
      .values({
        name: warehouseName,
        type: 'store_internal',
        storeId: storeId,
      })
      .returning();

    return warehouse;
  }

  // =================================================================
  // API 1: Lấy danh sách nhiệm vụ (Tasks)
  // =================================================================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTasks(warehouseId: number) {
    return this.db.query.orders.findMany({
      where: eq(schema.orders.status, OrderStatus.APPROVED),
      with: {
        store: true,
      },
      orderBy: [asc(schema.orders.deliveryDate)],
    });
  }

  // =================================================================
  // API 2: Lấy Picking List (Gợi ý FEFO)
  // =================================================================
  async getPickingList(orderId: string) {
    const shipment = await this.db.query.shipments.findFirst({
      where: eq(schema.shipments.orderId, orderId),
      with: {
        items: {
          with: {
            batch: { with: { product: true } },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(
        'Không tìm thấy chuyến hàng cho đơn hàng này',
      );
    }

    const groupedItems = new Map<
      number,
      {
        product_name: string;
        required_qty: number;
        suggested_batches: {
          batch_code: string;
          qty_to_pick: number;
          expiry: string;
        }[];
      }
    >();

    for (const item of shipment.items) {
      const productId = item.batch.productId;
      if (!groupedItems.has(productId)) {
        groupedItems.set(productId, {
          product_name: item.batch.product.name,
          required_qty: 0,
          suggested_batches: [],
        });
      }

      const entry = groupedItems.get(productId);
      if (!entry) {
        throw new InternalServerErrorException(
          'Lỗi khi xử lý nhóm các mặt hàng',
        );
      }

      const qty = parseFloat(item.quantity);
      entry.required_qty += qty;
      entry.suggested_batches.push({
        batch_code: item.batch.batchCode,
        qty_to_pick: qty,
        expiry: item.batch.expiryDate,
      });
    }

    return {
      order_id: orderId,
      items: Array.from(groupedItems.values()),
    };
  }

  // =================================================================
  // API 3: Báo cáo Lô lỗi & Đổi lô (Report Issue)
  // =================================================================
  async reportIssue(warehouseId: number, dto: ReportIssueDto) {
    return this.db.transaction(async (tx) => {
      // 1. Kiểm tra Inventory
      const inventory = await tx.query.inventory.findFirst({
        where: and(
          eq(schema.inventory.warehouseId, warehouseId),
          eq(schema.inventory.batchId, dto.batch_id),
        ),
      });

      if (!inventory) {
        throw new NotFoundException('Không tìm thấy lô hàng trong kho');
      }

      // 2. Tìm Shipment Item đang giữ lô này
      const shipmentItem = await tx.query.shipmentItems.findFirst({
        where: eq(schema.shipmentItems.batchId, dto.batch_id),
      });

      if (!shipmentItem) {
        throw new BadRequestException(
          'Lô hàng không nằm trong danh sách chọn hàng nào đang hoạt động',
        );
      }

      const qtyNeeded = parseFloat(shipmentItem.quantity);
      const shipmentId = shipmentItem.shipmentId;

      // --- FIX LỖI 1: Tách việc lấy Batch ra và kiểm tra tồn tại ---
      const batch = await tx.query.batches.findFirst({
        where: eq(schema.batches.id, dto.batch_id),
      });

      if (!batch) {
        throw new NotFoundException('Lỗi tính toàn vẹn dữ liệu lô hàng');
      }
      const productId = batch.productId;
      // -------------------------------------------------------------

      // 3. Xóa Shipment Item cũ (Gỡ lô hỏng ra khỏi đơn)
      await tx
        .delete(schema.shipmentItems)
        .where(eq(schema.shipmentItems.id, shipmentItem.id));

      // 4. Giảm Reserved Qty của lô hỏng
      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qtyNeeded}`,
        })
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.inventory.batchId, dto.batch_id),
          ),
        );

      // 5. Tìm Lô thay thế (Re-run FEFO logic)
      const candidateBatches = await tx
        .select()
        .from(schema.inventory)
        .innerJoin(
          schema.batches,
          eq(schema.inventory.batchId, schema.batches.id),
        )
        .where(
          and(
            eq(schema.inventory.warehouseId, warehouseId),
            eq(schema.batches.productId, productId),
            // Tránh lấy lại lô vừa báo lỗi
            sql`${schema.inventory.batchId} != ${dto.batch_id}`,
            // Available > 0
            sql`(${schema.inventory.quantity} - ${schema.inventory.reservedQuantity}) > 0`,
          ),
        )
        .orderBy(asc(schema.batches.expiryDate));

      let remainingToPick = qtyNeeded;

      // --- FIX LỖI 2: Định nghĩa kiểu dữ liệu rõ ràng cho mảng ---
      const newAllocations: { batch: string; qty: number }[] = [];
      // ----------------------------------------------------------

      for (const candidate of candidateBatches) {
        if (remainingToPick <= 0) break;
        const available =
          parseFloat(candidate.inventory.quantity) -
          parseFloat(candidate.inventory.reservedQuantity);
        const take = Math.min(available, remainingToPick);

        // Tạo shipment item mới
        await tx.insert(schema.shipmentItems).values({
          shipmentId: shipmentId,
          batchId: candidate.batches.id,
          quantity: take.toString(),
        });

        // Update Reserved cho lô mới
        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${take}`,
          })
          .where(eq(schema.inventory.id, candidate.inventory.id));

        newAllocations.push({
          batch: candidate.batches.batchCode,
          qty: take,
        });

        remainingToPick -= take;
      }

      if (remainingToPick > 0) {
        throw new BadRequestException(
          `Không đủ hàng trong kho để thay thế lô bị hỏng. Còn thiếu: ${remainingToPick}`,
        );
      }

      return {
        message: 'Đã báo cáo sự cố. Lô hàng đã được thay thế thành công.',
        old_batch_id: dto.batch_id,
        replaced_with: newAllocations,
      };
    });
  }

  // =================================================================
  // API 4: Hoàn tất giao hàng (Final Deduction)
  // =================================================================
  async finalizeShipment(warehouseId: number, dto: FinalizeShipmentDto) {
    return this.db.transaction(async (tx) => {
      const shipment = await tx.query.shipments.findFirst({
        where: eq(schema.shipments.orderId, dto.order_id),
        with: { items: true },
      });

      if (!shipment) throw new NotFoundException('Không tìm thấy chuyến hàng');
      if (shipment.status !== 'preparing') {
        throw new BadRequestException(
          'Chuyến hàng này đã được hoàn tất trước đó',
        );
      }

      for (const item of shipment.items) {
        const qty = parseFloat(item.quantity);
        await tx
          .update(schema.inventory)
          .set({
            quantity: sql`${schema.inventory.quantity} - ${qty}`,
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.inventory.warehouseId, warehouseId),
              eq(schema.inventory.batchId, item.batchId),
            ),
          );

        await tx.insert(schema.inventoryTransactions).values({
          warehouseId,
          batchId: item.batchId,
          type: 'export',
          quantityChange: (-qty).toString(),
          referenceId: shipment.id,
          reason: 'Xuất kho giao hàng',
        });
      }

      await tx
        .update(schema.shipments)
        .set({ status: 'in_transit', shipDate: new Date() })
        .where(eq(schema.shipments.id, shipment.id));

      await tx
        .update(schema.orders)
        .set({ status: OrderStatus.DELIVERING })
        .where(eq(schema.orders.id, dto.order_id));

      return {
        success: true,
        message: 'Đã hoàn tất chuyến hàng và trừ tồn kho thành công.',
      };
    });
  }

  // =================================================================
  // API 5: Quản lý Warehouse (CRUD)
  // =================================================================
  async create(dto: { name: string; type: string; storeId?: string }) {
    const [warehouse] = await this.db
      .insert(schema.warehouses)
      .values({
        name: dto.name,
        type: dto.type as 'central' | 'store_internal',
        storeId: dto.storeId,
      })
      .returning();
    return warehouse;
  }

  async findAll(query: { storeId?: string }) {
    return this.db.query.warehouses.findMany({
      where: query.storeId
        ? eq(schema.warehouses.storeId, query.storeId)
        : undefined,
      with: {
        store: true,
      },
    });
  }

  async findInventory(warehouseId: number) {
    // Re-use existing logic or query directly
    // Using simple query for now
    return this.db.query.inventory.findMany({
      where: eq(schema.inventory.warehouseId, warehouseId),
      with: {
        batch: {
          with: {
            product: true,
          },
        },
      },
    });
  }
}
