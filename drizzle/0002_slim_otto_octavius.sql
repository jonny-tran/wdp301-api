ALTER TABLE "inventory" ADD COLUMN "reserved_quantity" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority" text DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text;