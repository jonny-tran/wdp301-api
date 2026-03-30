CREATE TYPE "public"."manifest_status" AS ENUM('preparing', 'departed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."picking_list_status" AS ENUM('open', 'picking', 'staged', 'completed');--> statement-breakpoint
CREATE TABLE "manifests" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"driver_name" text,
	"vehicle_plate" text,
	"status" "manifest_status" DEFAULT 'preparing' NOT NULL,
	"departure_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "manifests_code_unique" UNIQUE("code")
);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "manifest_id" integer;--> statement-breakpoint
CREATE INDEX "idx_shipments_manifest_id" ON "shipments" USING btree ("manifest_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "picking_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"manifest_id" integer NOT NULL,
	"status" "picking_list_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "picking_lists_manifest_id_unique" UNIQUE("manifest_id")
);--> statement-breakpoint
CREATE INDEX "idx_picking_lists_manifest" ON "picking_lists" USING btree ("manifest_id");--> statement-breakpoint
ALTER TABLE "picking_lists" ADD CONSTRAINT "picking_lists_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "picking_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"picking_list_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"total_planned_quantity" numeric(12, 2) NOT NULL,
	"total_picked_quantity" numeric(12, 2) DEFAULT '0' NOT NULL
);--> statement-breakpoint
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_picking_list_id_picking_lists_id_fk" FOREIGN KEY ("picking_list_id") REFERENCES "public"."picking_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picking_list_items" ADD CONSTRAINT "picking_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_picking_list_items_list" ON "picking_list_items" USING btree ("picking_list_id");--> statement-breakpoint
CREATE INDEX "idx_picking_list_items_product" ON "picking_list_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "suggested_batch_id" integer;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "actual_batch_id" integer;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_suggested_batch_id_batches_id_fk" FOREIGN KEY ("suggested_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_actual_batch_id_batches_id_fk" FOREIGN KEY ("actual_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "shipment_items" SET "suggested_batch_id" = "batch_id" WHERE "suggested_batch_id" IS NULL;
