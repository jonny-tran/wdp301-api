-- PROD-LOGIC: định mức chuẩn, mã lệnh SX, planned/actual, lineage, cột tồn trên lô

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "standard_output" numeric(12, 4) DEFAULT 1 NOT NULL;

ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "available_quantity" numeric(12, 2) DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "reserved_quantity" numeric(12, 2) DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_orders' AND column_name = 'output_quantity'
  ) THEN
    ALTER TABLE "production_orders" RENAME COLUMN "output_quantity" TO "planned_quantity";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_orders' AND column_name = 'code'
  ) THEN
    ALTER TABLE "production_orders" ADD COLUMN "code" text;
    UPDATE "production_orders" SET "code" = 'PO-MIG-' || REPLACE("id"::text, '-', '') WHERE "code" IS NULL;
    ALTER TABLE "production_orders" ALTER COLUMN "code" SET NOT NULL;
    CREATE UNIQUE INDEX "production_orders_code_unique" ON "production_orders" ("code");
  END IF;
END $$;

ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "kitchen_staff_id" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_kitchen_staff_id_users_id_fk'
  ) THEN
    ALTER TABLE "production_orders"
      ADD CONSTRAINT "production_orders_kitchen_staff_id_users_id_fk"
      FOREIGN KEY ("kitchen_staff_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "actual_quantity" numeric(12, 4);
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "started_at" timestamp;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

CREATE TABLE IF NOT EXISTS "batch_lineage" (
  "id" serial PRIMARY KEY NOT NULL,
  "parent_batch_id" integer NOT NULL,
  "child_batch_id" integer NOT NULL,
  "production_order_id" uuid NOT NULL,
  "consumed_quantity" numeric(12, 4) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batch_lineage_parent_batch_id_batches_id_fk'
  ) THEN
    ALTER TABLE "batch_lineage"
      ADD CONSTRAINT "batch_lineage_parent_batch_id_batches_id_fk"
      FOREIGN KEY ("parent_batch_id") REFERENCES "batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batch_lineage_child_batch_id_batches_id_fk'
  ) THEN
    ALTER TABLE "batch_lineage"
      ADD CONSTRAINT "batch_lineage_child_batch_id_batches_id_fk"
      FOREIGN KEY ("child_batch_id") REFERENCES "batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batch_lineage_production_order_id_production_orders_id_fk'
  ) THEN
    ALTER TABLE "batch_lineage"
      ADD CONSTRAINT "batch_lineage_production_order_id_production_orders_id_fk"
      FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_batch_lineage_child" ON "batch_lineage" ("child_batch_id");
CREATE INDEX IF NOT EXISTS "idx_batch_lineage_parent" ON "batch_lineage" ("parent_batch_id");
CREATE INDEX IF NOT EXISTS "idx_batch_lineage_order" ON "batch_lineage" ("production_order_id");
