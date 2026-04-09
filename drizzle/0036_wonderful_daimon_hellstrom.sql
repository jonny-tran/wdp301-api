ALTER TYPE "public"."production_order_status" ADD VALUE 'pending' BEFORE 'in_progress';--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "reference_id" varchar(50);