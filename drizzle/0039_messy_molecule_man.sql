ALTER TABLE "production_orders" ALTER COLUMN "production_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "production_type" SET DEFAULT 'standard'::text;--> statement-breakpoint
DROP TYPE "public"."production_order_type";--> statement-breakpoint
CREATE TYPE "public"."production_order_type" AS ENUM('standard');--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "production_type" SET DEFAULT 'standard'::"public"."production_order_type";--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "production_type" SET DATA TYPE "public"."production_order_type" USING "production_type"::"public"."production_order_type";