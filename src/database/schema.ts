import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'admin',
  'manager',
  'supply_coordinator',
  'central_kitchen_staff',
  'franchise_store_staff',
]);

/** Trạng thái tài khoản — dùng chung cho cột users.status */
export const userStatusEnum = pgEnum('user_status', [
  'active',
  'banned',
  'pending',
  'rejected',
  'inactive',
]);
export const warehouseTypeEnum = pgEnum('warehouse_type', [
  'central',
  'store_internal',
]);

/** Phân loại sản phẩm: NL thô / TP bếp / hàng bán lại (Coca…) */
export const productTypeEnum = pgEnum('product_type', [
  'raw_material',
  'finished_good',
  'resell_product',
]);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  /**
   * Đang trong quá trình điều phối (Coordination Hub): khóa đơn để chờ hỏi bếp / phân bổ.
   * Store không nên sửa/hủy trong giai đoạn này (theo nghiệp vụ).
   */
  'coordinating',
  'approved',
  'rejected',
  'cancelled',
  'picking',
  'delivering',
  'completed',
  'claimed',
  'waiting_for_production',
]);
export const shipmentStatusEnum = pgEnum('shipment_status', [
  'preparing',
  'consolidated',
  'in_transit',
  'departed',
  'delivered',
  'completed',
  'cancelled',
]);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'import',
  'export',
  'waste',
  'adjustment',
  'production_consume',
  'production_output',
  /** Đặt chỗ theo đơn (Available ↓, Reserved ↑) */
  'reservation',
  /** Hoàn chỗ khi hủy / lỗi (Reserved ↓, Available ↑) */
  'release',
  /** Điều chỉnh giảm (hao hụt, trộm…) */
  'adjust_loss',
  /** Điều chỉnh tăng (kiểm kê dư) */
  'adjust_surplus',
  /** Xuất kho điều chuyển sang cửa hàng khác */
  'transfer_out',
  /** Nhập kho từ điều chuyển nội bộ */
  'transfer_in',
]);

/** Lý do tiêu hủy / ghi nhận trên inventory_transactions.waste_reason */
export const wasteReasonEnum = pgEnum('waste_reason', [
  'expired',
  'damaged',
  'quality_fail',
  'production_loss',
]);

export const vehicleStatusEnum = pgEnum('vehicle_status', [
  'available',
  'in_transit',
  'maintenance',
]);

export const transferOrderStatusEnum = pgEnum('transfer_order_status', [
  'draft',
  'pending',
  'in_transit',
  'completed',
  'cancelled',
]);
export const claimStatusEnum = pgEnum('claim_status', [
  'pending',
  'approved',
  'rejected',
]);
export const receiptStatusEnum = pgEnum('receipt_status', [
  'draft',
  'completed',
  'cancelled',
]);
export const batchStatusEnum = pgEnum('batch_status', [
  'pending',
  'available',
  'empty',
  'expired',
  /** Lô đang hoạt động (có thể phân bổ theo FEFO) */
  'active',
  /** Hỏng / không sử dụng được */
  'damaged',
]);

/** Lệnh điều xe (WH-OPTIMIZE): gom nhiều đơn / shipment một chuyến */
export const manifestStatusEnum = pgEnum('manifest_status', [
  'preparing',
  'departed',
  'cancelled',
]);

export const pickingListStatusEnum = pgEnum('picking_list_status', [
  'open',
  'picking',
  'staged',
  'completed',
]);

export const manifests = pgTable(
  'manifests',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    vehicleId: integer('vehicle_id').references(() => vehicles.id),
    vehiclePlate: text('vehicle_plate'),
    overloadWarning: boolean('overload_warning').default(false).notNull(),
    status: manifestStatusEnum('status').default('preparing').notNull(),
    departureAt: timestamp('departure_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  /** Ghi chú kèm yêu cầu tạo staff (Manager → Admin), optional */
  staffRequestNote: text('staff_request_note'),
  /** Lý do từ chối khi Admin reject yêu cầu tạo staff */
  staffRejectionReason: text('staff_rejection_reason'),
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

/** Tuyến giao hàng / logistics (gom manifest theo route) */
export const routes = pgTable('routes', {
  id: serial('id').primaryKey(),
  routeName: text('route_name').notNull(),
  distanceKm: decimal('distance_km', { precision: 10, scale: 2 }).notNull(),
  estimatedHours: decimal('estimated_hours', {
    precision: 10,
    scale: 2,
  }).notNull(),
  baseTransportCost: decimal('base_transport_cost', {
    precision: 12,
    scale: 2,
  }).notNull(),
});

/** Đội xe phục vụ manifest / shipment */
export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  licensePlate: text('license_plate').notNull().unique(),
  payloadCapacity: decimal('payload_capacity', {
    precision: 12,
    scale: 3,
  }).notNull(),
  fuelRatePerKm: decimal('fuel_rate_per_km', {
    precision: 12,
    scale: 4,
  }).notNull(),
  status: vehicleStatusEnum('status').default('available').notNull(),
});

export const stores = pgTable('stores', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  managerName: text('manager_name'),
  phone: text('phone'),
  isActive: boolean('is_active').default(true).notNull(),
  /** Cửa hàng thuộc tuyến logistics (gom đơn / lập lịch xe) */
  routeId: integer('route_id').references(() => routes.id),
  /** Tổng sức chứa tối đa (đơn vị cùng khối với quantity đặt/tồn). null = không giới hạn trong API */
  maxStorageCapacity: decimal('max_storage_capacity', {
    precision: 12,
    scale: 2,
  }),
  /** Thời gian vận chuyển tới cửa hàng (giờ), dùng cho lead time */
  transitTimeHours: integer('transit_time_hours').default(24).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const systemConfigs = pgTable('system_configs', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
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

export const baseUnits = pgTable('base_units', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  baseUnitId: integer('base_unit_id')
    .references(() => baseUnits.id)
    .notNull(),
  shelfLifeDays: integer('shelf_life_days').notNull(),
  minStockLevel: integer('min_stock_level').default(0).notNull(),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 })
    .default('0')
    .notNull(),
  /** Thời gian chuẩn bị / sơ chế (giờ), dùng cho lead time */
  prepTimeHours: integer('prep_time_hours').default(24).notNull(),
  packagingInfo: text('packaging_info'),
  weightKg: decimal('weight_kg', { precision: 10, scale: 3 }).default('0').notNull(),
  volumeM3: decimal('volume_m3', { precision: 10, scale: 4 }).default('0').notNull(),
  isHighValue: boolean('is_high_value').default(false).notNull(),
  /**
   * Đệm an toàn (ngày): chỉ bán khi HSD > CURRENT_DATE + min_shelf_life (mô hình KFC).
   */
  minShelfLife: integer('min_shelf_life').default(0).notNull(),
  type: productTypeEnum('type').default('raw_material').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const batches = pgTable(
  'batches',
  {
    id: serial('id').primaryKey(),
    batchCode: text('batch_code').notNull().unique(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    /** Ngày sản xuất gốc (truy xuất nguồn gốc) */
    manufacturedDate: date('manufactured_date').notNull(),
    expiryDate: date('expiry_date').notNull(),
    status: batchStatusEnum('status').default('pending').notNull(),
    imageUrl: text('image_url'),
    /** Tổng tồn vật lý (đồng bộ Σ inventory.quantity theo lô) — Physical = Available + Reserved */
    physicalQuantity: decimal('physical_quantity', {
      precision: 12,
      scale: 2,
    })
      .default('0')
      .notNull(),
    /** Tổng khả dụng / giữ chỗ cấp lô (đồng bộ từ inventory; nguồn chính vẫn là `inventory`) */
    availableQuantity: decimal('available_quantity', {
      precision: 12,
      scale: 2,
    })
      .default('0')
      .notNull(),
    reservedQuantity: decimal('reserved_quantity', {
      precision: 12,
      scale: 2,
    })
      .default('0')
      .notNull(),
    /** Giá vốn đơn vị tại thời điểm nhập / sản xuất (snapshot báo cáo tài chính) */
    unitCostAtImport: decimal('unit_cost_at_import', {
      precision: 12,
      scale: 4,
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    {
      expiryIdx: index('idx_batches_expiry').on(t.expiryDate),
    },
  ],
);

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  address: text('address'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const productionOrderStatusEnum = pgEnum('production_order_status', [
  /** Bếp tự tạo nháp */
  'draft',
  /**
   * Điều phối gửi yêu cầu từ duyệt đơn (chờ bếp nhận / bắt đầu).
   * Khác `draft`: có traceability qua `reference_id` / `note`.
   */
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

export const productionOrderTypeEnum = pgEnum('production_order_type', [
  'standard',
]);

/** Công thức (BOM): một thành phẩm = nhiều dòng nguyên liệu */
export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  outputProductId: integer('output_product_id')
    .references(() => products.id)
    .notNull(),
  /** Đồng bộ với tên sản phẩm thành phẩm (không nhập tay qua API) */
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const recipeItems = pgTable('recipe_items', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id')
    .references(() => recipes.id, { onDelete: 'cascade' })
    .notNull(),
  ingredientProductId: integer('ingredient_product_id')
    .references(() => products.id)
    .notNull(),
  /** Số lượng nguyên liệu cho 1 đơn vị thành phẩm đầu ra (1 đơn vị TP = quantityPerOutput đơn vị NL) */
  quantityPerOutput: decimal('quantity_per_output', {
    precision: 12,
    scale: 4,
  }).notNull(),
});

export const productionOrders = pgTable('production_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  recipeId: integer('recipe_id')
    .references(() => recipes.id)
    .notNull(),
  warehouseId: integer('warehouse_id')
    .references(() => warehouses.id)
    .notNull(),
  plannedQuantity: decimal('planned_quantity', {
    precision: 12,
    scale: 4,
  }).notNull(),
  actualQuantity: decimal('actual_quantity', {
    precision: 12,
    scale: 4,
  }),
  status: productionOrderStatusEnum('status').default('draft').notNull(),
  /** Diễn giải nguồn gốc (vd: "Yêu cầu từ đơn hàng …") — traceability cho bếp */
  note: text('note'),
  /** ID đơn hàng gốc (UUID string) — hỗ trợ JOIN/báo cáo theo yêu cầu điều phối */
  referenceId: varchar('reference_id', { length: 50 }),
  productionType: productionOrderTypeEnum('production_type')
    .default('standard')
    .notNull(),
  /** Lô nguyên liệu chỉ định (dự phòng nghiệp vụ nội bộ) */
  inputBatchId: integer('input_batch_id').references(() => batches.id),
  kitchenStaffId: uuid('kitchen_staff_id').references(() => users.id),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** Liên kết cha–con giữa lô nguyên liệu và lô thành phẩm (truy xuất nguồn gốc) */
export const batchLineage = pgTable('batch_lineage', {
  id: serial('id').primaryKey(),
  parentBatchId: integer('parent_batch_id')
    .references(() => batches.id)
    .notNull(),
  childBatchId: integer('child_batch_id')
    .references(() => batches.id)
    .notNull(),
  productionOrderId: uuid('production_order_id')
    .references(() => productionOrders.id)
    .notNull(),
  consumedQuantity: decimal('consumed_quantity', {
    precision: 12,
    scale: 4,
  }).notNull(),
});

export const productionReservations = pgTable('production_reservations', {
  id: serial('id').primaryKey(),
  productionOrderId: uuid('production_order_id')
    .references(() => productionOrders.id, { onDelete: 'cascade' })
    .notNull(),
  batchId: integer('batch_id')
    .references(() => batches.id)
    .notNull(),
  reservedQuantity: decimal('reserved_quantity', {
    precision: 12,
    scale: 4,
  }).notNull(),
});

// Receipts (Phiếu nhập)
export const receipts = pgTable('receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  warehouseId: integer('warehouse_id')
    .references(() => warehouses.id)
    .notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  status: receiptStatusEnum('status').default('draft').notNull(),
  note: text('note'),
  /** Phê duyệt nhập vượt ngưỡng sai số (manager / điều phối) */
  varianceApprovedBy: uuid('variance_approved_by').references(() => users.id),
  varianceApprovedAt: timestamp('variance_approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Receipt Items (details)
export const receiptItems = pgTable('receipt_items', {
  id: serial('id').primaryKey(),
  receiptId: uuid('receipt_id')
    .references(() => receipts.id)
    .notNull(),
  productId: integer('product_id').references(() => products.id),
  batchId: integer('batch_id').references(() => batches.id), // Gán khi chốt phiếu (hoặc legacy khi đã tạo lô trước đó)
  /** Tổng thực tế dòng (accepted + rejected), giữ tương thích API cũ */
  quantity: decimal('quantity').notNull(),
  quantityAccepted: decimal('quantity_accepted'),
  quantityRejected: decimal('quantity_rejected').default('0'),
  rejectionReason: text('rejection_reason'),
  /** Số lượng dự kiến theo đặt hàng — dùng kiểm tra sai số nhập dư */
  expectedQuantity: decimal('expected_quantity'),
  /** Mã quét vị trí kệ/ô sau khi xác nhận */
  storageLocationCode: text('storage_location_code'),
  /** NSX khai báo trên dòng phiếu (nháp) */
  manufacturedDate: date('manufactured_date'),
  /** HSD ghi nhận khi tách lô (ví dụ trứng nhiều HSD); nếu null thì tính từ NSX + shelf life */
  statedExpiryDate: date('stated_expiry_date'),
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
    /** node-pg trả numeric dạng string; aggregate/SUM trong repo nên cast + mapWith(Number). */
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

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
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
    wasteReason: wasteReasonEnum('waste_reason'),
    /** quantity × giá vốn tại thời điểm ghi nhận (tiêu hủy / điều chỉnh) */
    totalValueSnapshot: decimal('total_value_snapshot', {
      precision: 14,
      scale: 4,
    }),
    referenceId: text('reference_id'),
    reason: text('reason'),
    evidenceImage: text('evidence_image'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    index('idx_inventory_tx_type').on(t.type),
    index('idx_inventory_tx_reference').on(t.referenceId),
  ],
);

export const inventoryAdjustmentTicketStatusEnum = pgEnum(
  'inventory_adjustment_ticket_status',
  ['pending', 'approved', 'rejected'],
);

/** Phiếu điều chỉnh tồn cần phê duyệt quản lý (bổ sung quy trình) */
export const inventoryAdjustmentTickets = pgTable(
  'inventory_adjustment_tickets',
  {
    id: serial('id').primaryKey(),
    warehouseId: integer('warehouse_id')
      .references(() => warehouses.id)
      .notNull(),
    batchId: integer('batch_id')
      .references(() => batches.id)
      .notNull(),
    quantityChange: decimal('quantity_change', {
      precision: 12,
      scale: 2,
    }).notNull(),
    reason: text('reason'),
    evidenceImage: text('evidence_image'),
    status: inventoryAdjustmentTicketStatusEnum('status')
      .default('pending')
      .notNull(),
    requestedBy: uuid('requested_by').references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

export const orders = pgTable(
  'orders',
  {
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
    /** Lý do hủy đơn (bếp / cửa hàng / điều phối) — tách khỏi `note` ghi chú đơn */
    cancelReason: text('cancel_reason'),
    /** Cùng group → gộp shipment (cùng store, cùng ngày giao hàng trong cửa sổ chưa chốt) */
    consolidationGroupId: uuid('consolidation_group_id'),
    requiresProductionConfirm: boolean('requires_production_confirm')
      .default(false)
      .notNull(),
    /** Giá lệch >20% so với catalog; cần cửa hàng xác nhận trước khi auto/duyệt */
    pendingPriceConfirm: boolean('pending_price_confirm')
      .default(false)
      .notNull(),
    /** Phiếu giao (shipment) chính gắn đơn — đồng bộ khi duyệt / gom manifest */
    shipmentId: uuid('shipment_id').references(() => shipments.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    {
      statusIdx: index('idx_orders_status').on(t.status), // <-- THÊM INDEX
      createdAtIdx: index('idx_orders_created_at').on(t.createdAt), // <-- THÊM INDEX
    },
  ],
);

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
  /** Snapshot tại thời điểm đặt — không đổi khi master product thay đổi */
  unitSnapshot: varchar('unit_snapshot', { length: 100 }),
  priceSnapshot: decimal('price_snapshot', { precision: 12, scale: 2 }),
  /** Giá bán cho franchise tại thời điểm đặt đơn (snapshot tài chính) */
  unitPriceAtOrder: decimal('unit_price_at_order', {
    precision: 12,
    scale: 4,
  }),
  /** Giá vốn đơn vị chốt lúc duyệt (theo lô FEFO đầu tiên được phân bổ) */
  unitCostAtImport: decimal('unit_cost_at_import', {
    precision: 12,
    scale: 4,
  }),
  packagingInfoSnapshot: text('packaging_info_snapshot'),
});

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id)
      .notNull(),
    /** Gom chuyến theo manifest (wave picking / xuất kho theo xe) */
    manifestId: integer('manifest_id').references(() => manifests.id),
    fromWarehouseId: integer('from_warehouse_id')
      .references(() => warehouses.id)
      .notNull(),
    toWarehouseId: integer('to_warehouse_id')
      .references(() => warehouses.id)
      .notNull(),
    vehicleId: integer('vehicle_id').references(() => vehicles.id),
    routeId: integer('route_id').references(() => routes.id),
    status: shipmentStatusEnum('status').default('preparing').notNull(),
    shipDate: timestamp('ship_date'),
    consolidationGroupId: uuid('consolidation_group_id'),
    /** Chi phí vận chuyển thực tế chuyến (đối soát lãi/lỗ manifest) */
    actualTransportCost: decimal('actual_transport_cost', {
      precision: 12,
      scale: 2,
    }),
    /** Tổng khối lượng chuyến (kiểm soát tải trọng xe; có thể đồng bộ với total_weight_kg) */
    totalWeight: decimal('total_weight', { precision: 12, scale: 3 }),
    totalWeightKg: decimal('total_weight_kg', { precision: 12, scale: 3 }),
    totalVolumeM3: decimal('total_volume_m3', { precision: 12, scale: 4 }),
    overloadWarning: boolean('overload_warning').default(false).notNull(),
    /** Snapshot địa chỉ giao hàng tại thời điểm tạo shipment */
    shippingAddressSnapshot: text('shipping_address_snapshot'),
    /** Snapshot số điện thoại liên hệ nhận hàng tại thời điểm tạo shipment */
    contactPhoneSnapshot: text('contact_phone_snapshot'),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    {
      statusIdx: index('idx_shipments_status').on(t.status), // <-- THÊM INDEX
      manifestIdx: index('idx_shipments_manifest_id').on(t.manifestId),
    },
  ],
);

export const pickingLists = pgTable(
  'picking_lists',
  {
    id: serial('id').primaryKey(),
    manifestId: integer('manifest_id')
      .references(() => manifests.id)
      .notNull()
      .unique(),
    status: pickingListStatusEnum('status').default('open').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    manifestIdx: index('idx_picking_lists_manifest').on(t.manifestId),
  }),
);

export const pickingListItems = pgTable(
  'picking_list_items',
  {
    id: serial('id').primaryKey(),
    pickingListId: integer('picking_list_id')
      .references(() => pickingLists.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    totalPlannedQuantity: decimal('total_planned_quantity', {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalPickedQuantity: decimal('total_picked_quantity', {
      precision: 12,
      scale: 2,
    })
      .default('0')
      .notNull(),
  },
  (t) => ({
    listIdx: index('idx_picking_list_items_list').on(t.pickingListId),
    productIdx: index('idx_picking_list_items_product').on(t.productId),
  }),
);

export const shipmentItems = pgTable('shipment_items', {
  id: serial('id').primaryKey(),
  shipmentId: uuid('shipment_id')
    .references(() => shipments.id)
    .notNull(),
  batchId: integer('batch_id')
    .references(() => batches.id)
    .notNull(),
  /** Lô FEFO hệ thống chỉ định (phải quét đúng trừ khi báo hỏng) */
  suggestedBatchId: integer('suggested_batch_id').references(() => batches.id),
  /** Lô thực tế sau khi quét xác nhận */
  actualBatchId: integer('actual_batch_id').references(() => batches.id),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  /** Giá đơn vị tại thời điểm xuất kho / giao (snapshot tài chính) */
  unitPriceAtShipment: decimal('unit_price_at_shipment', {
    precision: 12,
    scale: 4,
  }),
});

/** Điều chuyển tồn liên cửa hàng */
export const transferOrders = pgTable('transfer_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromStoreId: uuid('from_store_id')
    .references(() => stores.id)
    .notNull(),
  toStoreId: uuid('to_store_id')
    .references(() => stores.id)
    .notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  status: transferOrderStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Một shipment có thể gộp nhiều đơn (consolidation) */
export const shipmentOrders = pgTable(
  'shipment_orders',
  {
    shipmentId: uuid('shipment_id')
      .references(() => shipments.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shipmentId, t.orderId] }),
  }),
);

export const restockTasks = pgTable('restock_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  shipmentId: uuid('shipment_id').references(() => shipments.id, {
    onDelete: 'set null',
  }),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
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
  createdTransferOrders: many(transferOrders),
  createdProductionOrders: many(productionOrders, {
    relationName: 'productionOrderCreator',
  }),
  kitchenStaffProductionOrders: many(productionOrders, {
    relationName: 'productionOrderKitchenStaff',
  }),
}));

export const routesRelations = relations(routes, ({ many }) => ({
  stores: many(stores),
  shipments: many(shipments),
}));

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  shipments: many(shipments),
}));

export const storeRelations = relations(stores, ({ one, many }) => ({
  route: one(routes, { fields: [stores.routeId], references: [routes.id] }),
  warehouses: many(warehouses),
  orders: many(orders),
  users: many(users),
  transferOrdersFrom: many(transferOrders, {
    relationName: 'transferOrderFromStore',
  }),
  transferOrdersTo: many(transferOrders, {
    relationName: 'transferOrderToStore',
  }),
}));

export const warehouseRelations = relations(warehouses, ({ one, many }) => ({
  store: one(stores, { fields: [warehouses.storeId], references: [stores.id] }),
  inventory: many(inventory),
}));

export const baseUnitRelations = relations(baseUnits, ({ many }) => ({
  products: many(products),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  batches: many(batches),
  baseUnit: one(baseUnits, {
    fields: [products.baseUnitId],
    references: [baseUnits.id],
  }),
}));

export const batchRelations = relations(batches, ({ one, many }) => ({
  product: one(products, {
    fields: [batches.productId],
    references: [products.id],
  }),
  inventory: many(inventory),
  lineageAsParent: many(batchLineage, { relationName: 'lineageParent' }),
  lineageAsChild: many(batchLineage, { relationName: 'lineageChild' }),
  shipmentItemsAsSuggested: many(shipmentItems, {
    relationName: 'shipmentItemSuggestedBatch',
  }),
  shipmentItemsAsActual: many(shipmentItems, {
    relationName: 'shipmentItemActualBatch',
  }),
  inputBatchProductionOrders: many(productionOrders, {
    relationName: 'productionOrderInputBatch',
  }),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  items: many(orderItems),
  shipment: one(shipments, {
    fields: [orders.shipmentId],
    references: [shipments.id],
  }),
  shipmentOrderLinks: many(shipmentOrders),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const manifestRelations = relations(manifests, ({ one, many }) => ({
  pickingList: one(pickingLists, {
    fields: [manifests.id],
    references: [pickingLists.manifestId],
  }),
  vehicle: one(vehicles, {
    fields: [manifests.vehicleId],
    references: [vehicles.id],
  }),
  shipments: many(shipments),
}));

export const pickingListRelations = relations(pickingLists, ({ one, many }) => ({
  manifest: one(manifests, {
    fields: [pickingLists.manifestId],
    references: [manifests.id],
  }),
  items: many(pickingListItems),
}));

export const pickingListItemRelations = relations(
  pickingListItems,
  ({ one }) => ({
    pickingList: one(pickingLists, {
      fields: [pickingListItems.pickingListId],
      references: [pickingLists.id],
    }),
    product: one(products, {
      fields: [pickingListItems.productId],
      references: [products.id],
    }),
  }),
);

export const shipmentRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  manifest: one(manifests, {
    fields: [shipments.manifestId],
    references: [manifests.id],
  }),
  vehicle: one(vehicles, {
    fields: [shipments.vehicleId],
    references: [vehicles.id],
  }),
  route: one(routes, {
    fields: [shipments.routeId],
    references: [routes.id],
  }),
  items: many(shipmentItems),
  claims: many(claims),
  orderLinks: many(shipmentOrders),
}));

export const transferOrderRelations = relations(transferOrders, ({ one }) => ({
  fromStore: one(stores, {
    fields: [transferOrders.fromStoreId],
    references: [stores.id],
    relationName: 'transferOrderFromStore',
  }),
  toStore: one(stores, {
    fields: [transferOrders.toStoreId],
    references: [stores.id],
    relationName: 'transferOrderToStore',
  }),
  creator: one(users, {
    fields: [transferOrders.createdBy],
    references: [users.id],
  }),
}));

export const shipmentOrderLinkRelations = relations(
  shipmentOrders,
  ({ one }) => ({
    shipment: one(shipments, {
      fields: [shipmentOrders.shipmentId],
      references: [shipments.id],
    }),
    order: one(orders, {
      fields: [shipmentOrders.orderId],
      references: [orders.id],
    }),
  }),
);

export const shipmentItemRelations = relations(shipmentItems, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentItems.shipmentId],
    references: [shipments.id],
  }),
  batch: one(batches, {
    fields: [shipmentItems.batchId],
    references: [batches.id],
  }),
  suggestedBatch: one(batches, {
    fields: [shipmentItems.suggestedBatchId],
    references: [batches.id],
    relationName: 'shipmentItemSuggestedBatch',
  }),
  actualBatch: one(batches, {
    fields: [shipmentItems.actualBatchId],
    references: [batches.id],
    relationName: 'shipmentItemActualBatch',
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
    creator: one(users, {
      fields: [inventoryTransactions.createdBy],
      references: [users.id],
    }),
  }),
);

export const inventoryAdjustmentTicketRelations = relations(
  inventoryAdjustmentTickets,
  ({ one }) => ({
    warehouse: one(warehouses, {
      fields: [inventoryAdjustmentTickets.warehouseId],
      references: [warehouses.id],
    }),
    batch: one(batches, {
      fields: [inventoryAdjustmentTickets.batchId],
      references: [batches.id],
    }),
    requester: one(users, {
      fields: [inventoryAdjustmentTickets.requestedBy],
      references: [users.id],
    }),
    decider: one(users, {
      fields: [inventoryAdjustmentTickets.decidedBy],
      references: [users.id],
    }),
  }),
);
// Receipt Relations
export const receiptRelations = relations(receipts, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [receipts.supplierId],
    references: [suppliers.id],
  }),
  warehouse: one(warehouses, {
    fields: [receipts.warehouseId],
    references: [warehouses.id],
  }),
  user: one(users, { fields: [receipts.createdBy], references: [users.id] }),
  items: many(receiptItems),
}));

export const receiptItemRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptItems.receiptId],
    references: [receipts.id],
  }),
  product: one(products, {
    fields: [receiptItems.productId],
    references: [products.id],
  }),
  batch: one(batches, {
    fields: [receiptItems.batchId],
    references: [batches.id],
  }),
}));

export const supplierRelations = relations(suppliers, ({ many }) => ({
  receipts: many(receipts),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  outputProduct: one(products, {
    fields: [recipes.outputProductId],
    references: [products.id],
  }),
  items: many(recipeItems),
}));

export const recipeItemsRelations = relations(recipeItems, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeItems.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(products, {
    fields: [recipeItems.ingredientProductId],
    references: [products.id],
  }),
}));

export const productionOrdersRelations = relations(
  productionOrders,
  ({ one, many }) => ({
    recipe: one(recipes, {
      fields: [productionOrders.recipeId],
      references: [recipes.id],
    }),
    inputBatch: one(batches, {
      fields: [productionOrders.inputBatchId],
      references: [batches.id],
      relationName: 'productionOrderInputBatch',
    }),
    creator: one(users, {
      fields: [productionOrders.createdBy],
      references: [users.id],
      relationName: 'productionOrderCreator',
    }),
    kitchenStaff: one(users, {
      fields: [productionOrders.kitchenStaffId],
      references: [users.id],
      relationName: 'productionOrderKitchenStaff',
    }),
    reservations: many(productionReservations),
    batchLineages: many(batchLineage),
  }),
);

export const batchLineageRelations = relations(batchLineage, ({ one }) => ({
  productionOrder: one(productionOrders, {
    fields: [batchLineage.productionOrderId],
    references: [productionOrders.id],
  }),
  parentBatch: one(batches, {
    fields: [batchLineage.parentBatchId],
    references: [batches.id],
    relationName: 'lineageParent',
  }),
  childBatch: one(batches, {
    fields: [batchLineage.childBatchId],
    references: [batches.id],
    relationName: 'lineageChild',
  }),
}));

export const productionReservationsRelations = relations(
  productionReservations,
  ({ one }) => ({
    order: one(productionOrders, {
      fields: [productionReservations.productionOrderId],
      references: [productionOrders.id],
    }),
    batch: one(batches, {
      fields: [productionReservations.batchId],
      references: [batches.id],
    }),
  }),
);
