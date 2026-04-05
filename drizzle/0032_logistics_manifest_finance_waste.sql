CREATE TYPE "public"."transfer_order_status" AS ENUM('draft', 'pending', 'in_transit', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'in_transit', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."waste_reason" AS ENUM('expired', 'damaged', 'quality_fail', 'production_loss');--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'consolidated' BEFORE 'in_transit';--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'departed' BEFORE 'delivered';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'transfer_out';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'transfer_in';--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_name" text NOT NULL,
	"distance_km" numeric(10, 2) NOT NULL,
	"estimated_hours" numeric(10, 2) NOT NULL,
	"base_transport_cost" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_store_id" uuid NOT NULL,
	"to_store_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "transfer_order_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_plate" text NOT NULL,
	"payload_capacity" numeric(12, 3) NOT NULL,
	"fuel_rate_per_km" numeric(12, 4) NOT NULL,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	CONSTRAINT "vehicles_license_plate_unique" UNIQUE("license_plate")
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "unit_cost_at_import" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "waste_reason" "waste_reason";--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "total_value_snapshot" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_price_at_order" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "unit_price_at_shipment" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "vehicle_id" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "route_id" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "actual_transport_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "total_weight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "route_id" integer;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_from_store_id_stores_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_to_store_id_stores_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;