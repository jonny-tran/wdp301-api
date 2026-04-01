CREATE TYPE "public"."product_type" AS ENUM('raw_material', 'finished_good', 'resell_product');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "type" "product_type" DEFAULT 'raw_material' NOT NULL;--> statement-breakpoint
