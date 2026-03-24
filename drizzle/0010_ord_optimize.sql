-- ORD-OPTIMIZE: snapshot, capacity, lead time, consolidation, restock tasks, hard constraints

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "prep_time_hours" integer DEFAULT 24 NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packaging_info" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_kg" numeric(10, 3) DEFAULT '0' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "volume_m3" numeric(10, 4) DEFAULT '0' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_high_value" boolean DEFAULT false NOT NULL;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "max_storage_capacity" numeric(12, 2);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "transit_time_hours" integer DEFAULT 24 NOT NULL;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_snapshot" varchar(100);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "price_snapshot" numeric(12, 2);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "packaging_info_snapshot" text;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "consolidation_group_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "requires_production_confirm" boolean DEFAULT false NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pending_price_confirm" boolean DEFAULT false NOT NULL;

ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "consolidation_group_id" uuid;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "total_weight_kg" numeric(12, 3);
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "total_volume_m3" numeric(12, 4);
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "overload_warning" boolean DEFAULT false NOT NULL;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;

CREATE TABLE IF NOT EXISTS "shipment_orders" (
	"shipment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	CONSTRAINT "shipment_orders_shipment_id_order_id_pk" PRIMARY KEY("shipment_id","order_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "restock_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restock_tasks" ADD CONSTRAINT "restock_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restock_tasks" ADD CONSTRAINT "restock_tasks_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Backfill shipment_orders from legacy shipments.order_id
INSERT INTO "shipment_orders" ("shipment_id", "order_id")
SELECT s.id, s.order_id FROM shipments s
WHERE NOT EXISTS (
  SELECT 1 FROM shipment_orders so WHERE so.shipment_id = s.id AND so.order_id = s.order_id
);

CREATE INDEX IF NOT EXISTS "idx_orders_consolidation_group" ON "orders" ("consolidation_group_id");
CREATE INDEX IF NOT EXISTS "idx_shipments_consolidation_group" ON "shipments" ("consolidation_group_id");
