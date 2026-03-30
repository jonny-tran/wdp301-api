CREATE TYPE "public"."production_order_status" AS ENUM('draft', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'production_consume';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'production_output';--> statement-breakpoint
CREATE TABLE "batch_lineage" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_batch_id" integer NOT NULL,
	"child_batch_id" integer NOT NULL,
	"production_order_id" uuid NOT NULL,
	"consumed_quantity" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"recipe_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"planned_quantity" numeric(12, 4) NOT NULL,
	"actual_quantity" numeric(12, 4),
	"status" "production_order_status" DEFAULT 'draft' NOT NULL,
	"kitchen_staff_id" uuid,
	"created_by" uuid NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "production_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "production_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"production_order_id" uuid NOT NULL,
	"batch_id" integer NOT NULL,
	"reserved_quantity" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"ingredient_product_id" integer NOT NULL,
	"quantity_per_output" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"output_product_id" integer NOT NULL,
	"name" text NOT NULL,
	"standard_output" numeric(12, 4) DEFAULT '1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "manufactured_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "available_quantity" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "reserved_quantity" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "quantity_accepted" numeric;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "quantity_rejected" numeric DEFAULT '0';--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "expected_quantity" numeric;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "storage_location_code" text;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "manufactured_date" date;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "stated_expiry_date" date;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "variance_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "variance_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "batch_lineage" ADD CONSTRAINT "batch_lineage_parent_batch_id_batches_id_fk" FOREIGN KEY ("parent_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lineage" ADD CONSTRAINT "batch_lineage_child_batch_id_batches_id_fk" FOREIGN KEY ("child_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lineage" ADD CONSTRAINT "batch_lineage_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_kitchen_staff_id_users_id_fk" FOREIGN KEY ("kitchen_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reservations" ADD CONSTRAINT "production_reservations_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reservations" ADD CONSTRAINT "production_reservations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_product_id_products_id_fk" FOREIGN KEY ("ingredient_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_output_product_id_products_id_fk" FOREIGN KEY ("output_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_variance_approved_by_users_id_fk" FOREIGN KEY ("variance_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;