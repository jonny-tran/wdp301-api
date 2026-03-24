ALTER TYPE "public"."order_status" ADD VALUE 'waiting_for_production';--> statement-breakpoint
CREATE TABLE "restock_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipment_orders" (
	"shipment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	CONSTRAINT "shipment_orders_shipment_id_order_id_pk" PRIMARY KEY("shipment_id","order_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "packaging_info_snapshot" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "consolidation_group_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "requires_production_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pending_price_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "prep_time_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "packaging_info" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_kg" numeric(10, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "volume_m3" numeric(10, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_high_value" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "consolidation_group_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "total_weight_kg" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "total_volume_m3" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "overload_warning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "max_storage_capacity" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "transit_time_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "restock_tasks" ADD CONSTRAINT "restock_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_tasks" ADD CONSTRAINT "restock_tasks_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;