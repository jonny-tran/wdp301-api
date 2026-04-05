CREATE TYPE "public"."production_order_type" AS ENUM('standard', 'salvage');--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "production_type" "production_order_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "input_batch_id" integer;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_input_batch_id_batches_id_fk" FOREIGN KEY ("input_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;