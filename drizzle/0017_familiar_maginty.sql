CREATE TYPE "public"."inventory_adjustment_ticket_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."batch_status" ADD VALUE 'active';--> statement-breakpoint
ALTER TYPE "public"."batch_status" ADD VALUE 'damaged';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'reservation';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'release';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'adjust_loss';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'adjust_surplus';--> statement-breakpoint
CREATE TABLE "inventory_adjustment_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"warehouse_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"quantity_change" numeric(12, 2) NOT NULL,
	"reason" text,
	"evidence_image" text,
	"status" "inventory_adjustment_ticket_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "physical_quantity" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "evidence_image" text;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_shelf_life" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_tickets" ADD CONSTRAINT "inventory_adjustment_tickets_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_tickets" ADD CONSTRAINT "inventory_adjustment_tickets_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_tickets" ADD CONSTRAINT "inventory_adjustment_tickets_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_tickets" ADD CONSTRAINT "inventory_adjustment_tickets_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_type" ON "inventory_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_reference" ON "inventory_transactions" USING btree ("reference_id");