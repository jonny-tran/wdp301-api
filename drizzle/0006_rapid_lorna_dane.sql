ALTER TABLE "products" ADD COLUMN "min_stock_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;