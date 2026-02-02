import { Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { InventoryDto } from './inventory.dto';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async getStoreInventory(warehouseId: number) {
    const inventory =
      await this.inventoryRepository.getStoreInventory(warehouseId);

    return inventory.map<InventoryDto>((item) => ({
      inventoryId: item.id,
      batchId: item.batchId,
      productId: item.batch.productId,
      productName: item.batch.product.name,
      sku: item.batch.product.sku,
      batchCode: item.batch.batchCode,
      quantity: parseFloat(item.quantity),
      expiryDate: new Date(item.batch.expiryDate),
      unit: item.batch.product.baseUnit,
      imageUrl: item.batch.product.imageUrl || null,
    }));
  }

  async getInventoryByStoreId(storeId: string) {
    const warehouse =
      await this.inventoryRepository.findWarehouseByStoreId(storeId);

    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho cho cửa hàng này');
    }

    return this.getStoreInventory(warehouse.id);
  }

  async getStoreTransactions(
    storeId: string,
    query: {
      type?: 'import' | 'export' | 'waste' | 'adjustment';
      limit?: number;
      offset?: number;
    },
  ) {
    const warehouse =
      await this.inventoryRepository.findWarehouseByStoreId(storeId);

    if (!warehouse) {
      throw new NotFoundException('Không tìm thấy kho cho cửa hàng này');
    }

    const transactions = await this.inventoryRepository.getStoreTransactions(
      warehouse.id,
      query,
    );

    return transactions.map((tx) => ({
      transactionType: tx.type,
      quantityChange: parseFloat(tx.quantityChange),
      productName: tx.batch.product.name,
      batchCode: tx.batch.batchCode,
      createdAt: tx.createdAt,
      referenceId: tx.referenceId,
    }));
  }

  async updateInventory(
    warehouseId: number,
    batchId: number,
    quantityChange: number,
    tx: NodePgDatabase<typeof schema>,
  ) {
    return this.inventoryRepository.upsertInventory(
      warehouseId,
      batchId,
      quantityChange,
      tx,
    );
  }

  async logInventoryTransaction(
    warehouseId: number,
    batchId: number,
    type: 'import' | 'export' | 'waste' | 'adjustment',
    quantityChange: number,
    referenceId?: string,
    reason?: string,
    tx?: NodePgDatabase<typeof schema>,
  ) {
    return this.inventoryRepository.createInventoryTransaction(
      warehouseId,
      batchId,
      type,
      quantityChange,
      referenceId,
      reason,
      tx,
    );
  }
}
