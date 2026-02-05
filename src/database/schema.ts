import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'admin',
  'manager',
  'supply_coordinator',
  'central_kitchen_staff',
  'franchise_store_staff',
]);

export const userStatusEnum = pgEnum('user_status', ['active', 'banned']);
export const warehouseTypeEnum = pgEnum('warehouse_type', [
  'central',
  'store_internal',
]);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'picking',
  'delivering',
  'completed',
  'claimed',
]);
export const shipmentStatusEnum = pgEnum('shipment_status', [
  'preparing',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
]);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'import',
  'export',
  'waste',
  'adjustment',
]);
export const claimStatusEnum = pgEnum('claim_status', [
  'pending',
  'approved',
  'rejected',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull(),
  storeId: uuid('store_id'),
  status: userStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  code: text('code').notNull(),
  type: text('type').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const stores = pgTable('stores', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  managerName: text('manager_name'),
  phone: text('phone'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: warehouseTypeEnum('type').notNull(),
  storeId: uuid('store_id').references(() => stores.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  baseUnit: text('base_unit').notNull(),
  shelfLifeDays: integer('shelf_life_days').notNull(),
  minStockLevel: integer('min_stock_level').default(0).notNull(),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const batches = pgTable('batches', {
  id: serial('id').primaryKey(),
  batchCode: text('batch_code').notNull().unique(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  expiryDate: date('expiry_date').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventory = pgTable(
  'inventory',
  {
    id: serial('id').primaryKey(),
    warehouseId: integer('warehouse_id')
      .references(() => warehouses.id)
      .notNull(),
    batchId: integer('batch_id')
      .references(() => batches.id)
      .notNull(),
    quantity: decimal('quantity', { precision: 10, scale: 2 })
      .default('0')
      .notNull(),
    reservedQuantity: decimal('reserved_quantity', { precision: 10, scale: 2 })
      .default('0')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex('unique_inventory_item').on(t.warehouseId, t.batchId),
  }),
);

export const inventoryTransactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  warehouseId: integer('warehouse_id')
    .references(() => warehouses.id)
    .notNull(),
  batchId: integer('batch_id')
    .references(() => batches.id)
    .notNull(),
  type: transactionTypeEnum('type').notNull(),
  quantityChange: decimal('quantity_change', {
    precision: 10,
    scale: 2,
  }).notNull(),
  referenceId: text('reference_id'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  storeId: uuid('store_id')
    .references(() => stores.id)
    .notNull(),
  status: orderStatusEnum('status').default('pending').notNull(),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default(
    '0',
  ),
  deliveryDate: timestamp('delivery_date').notNull(),
  priority: text('priority').default('standard'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  quantityRequested: decimal('quantity_requested', {
    precision: 10,
    scale: 2,
  }).notNull(),
  quantityApproved: decimal('quantity_approved', { precision: 10, scale: 2 }),
});

export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  fromWarehouseId: integer('from_warehouse_id')
    .references(() => warehouses.id)
    .notNull(),
  toWarehouseId: integer('to_warehouse_id')
    .references(() => warehouses.id)
    .notNull(),
  status: shipmentStatusEnum('status').default('preparing').notNull(),
  shipDate: timestamp('ship_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const shipmentItems = pgTable('shipment_items', {
  id: serial('id').primaryKey(),
  shipmentId: uuid('shipment_id')
    .references(() => shipments.id)
    .notNull(),
  batchId: integer('batch_id')
    .references(() => batches.id)
    .notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
});

export const claims = pgTable('claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  shipmentId: uuid('shipment_id')
    .references(() => shipments.id)
    .notNull(),
  status: claimStatusEnum('status').default('pending').notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

export const claimItems = pgTable('claim_items', {
  id: serial('id').primaryKey(),
  claimId: uuid('claim_id')
    .references(() => claims.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  quantityMissing: decimal('quantity_missing', {
    precision: 10,
    scale: 2,
  }).default('0'),
  quantityDamaged: decimal('quantity_damaged', {
    precision: 10,
    scale: 2,
  }).default('0'),
  reason: text('reason'),
  imageUrl: text('image_url'),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, { fields: [users.storeId], references: [stores.id] }),
  refreshTokens: many(refreshTokens),
  otpCodes: many(otpCodes),
}));

export const storeRelations = relations(stores, ({ many }) => ({
  warehouses: many(warehouses),
  orders: many(orders),
  users: many(users),
}));

export const warehouseRelations = relations(warehouses, ({ one, many }) => ({
  store: one(stores, { fields: [warehouses.storeId], references: [stores.id] }),
  inventory: many(inventory),
}));

export const productRelations = relations(products, ({ many }) => ({
  batches: many(batches),
}));

export const batchRelations = relations(batches, ({ one, many }) => ({
  product: one(products, {
    fields: [batches.productId],
    references: [products.id],
  }),
  inventory: many(inventory),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  items: many(orderItems),
  shipment: one(shipments),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const shipmentRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  items: many(shipmentItems),
  claims: many(claims),
}));

export const shipmentItemRelations = relations(shipmentItems, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentItems.shipmentId],
    references: [shipments.id],
  }),
  batch: one(batches, {
    fields: [shipmentItems.batchId],
    references: [batches.id],
  }),
}));

export const claimRelations = relations(claims, ({ one, many }) => ({
  shipment: one(shipments, {
    fields: [claims.shipmentId],
    references: [shipments.id],
  }),
  items: many(claimItems),
  creator: one(users, { fields: [claims.createdBy], references: [users.id] }),
}));

export const claimItemRelations = relations(claimItems, ({ one }) => ({
  claim: one(claims, { fields: [claimItems.claimId], references: [claims.id] }),
  product: one(products, {
    fields: [claimItems.productId],
    references: [products.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  warehouse: one(warehouses, {
    fields: [inventory.warehouseId],
    references: [warehouses.id],
  }),

  batch: one(batches, {
    fields: [inventory.batchId],
    references: [batches.id],
  }),
}));

export const inventoryTransactionRelations = relations(
  inventoryTransactions,
  ({ one }) => ({
    warehouse: one(warehouses, {
      fields: [inventoryTransactions.warehouseId],
      references: [warehouses.id],
    }),
    batch: one(batches, {
      fields: [inventoryTransactions.batchId],
      references: [batches.id],
    }),
  }),
);
