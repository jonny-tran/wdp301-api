-- INB-OPTIMIZE: truy xuất NSX, QC nhận/từ chối, variance, vị trí kệ; chuẩn bị production tx types

-- Batches: ngày sản xuất (bắt buộc sau backfill)
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "manufactured_date" date;

UPDATE "batches" b
SET "manufactured_date" = (
  b."expiry_date"::timestamp - (COALESCE(p."shelf_life_days", 0) || ' days')::interval
)::date
FROM "products" p
WHERE p."id" = b."product_id" AND b."manufactured_date" IS NULL;

UPDATE "batches" SET "manufactured_date" = ("created_at"::timestamp AT TIME ZONE 'UTC')::date
WHERE "manufactured_date" IS NULL;

ALTER TABLE "batches" ALTER COLUMN "manufactured_date" SET NOT NULL;

-- Receipt items: product_id, QC, variance, vị trí
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "product_id" integer;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "quantity_accepted" numeric;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "quantity_rejected" numeric DEFAULT '0';
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "expected_quantity" numeric;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "storage_location_code" text;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "manufactured_date" date;
ALTER TABLE "receipt_items" ADD COLUMN IF NOT EXISTS "stated_expiry_date" date;

UPDATE "receipt_items" ri
SET "manufactured_date" = b."manufactured_date"
FROM "batches" b
WHERE ri."batch_id" = b."id" AND ri."manufactured_date" IS NULL;

UPDATE "receipt_items" SET "manufactured_date" = CURRENT_DATE WHERE "manufactured_date" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipt_items_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "receipt_items"
      ADD CONSTRAINT "receipt_items_product_id_products_id_fk"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

UPDATE "receipt_items" ri
SET "product_id" = b."product_id"
FROM "batches" b
WHERE ri."batch_id" = b."id" AND ri."product_id" IS NULL;

UPDATE "receipt_items" SET "quantity_accepted" = "quantity"::numeric WHERE "quantity_accepted" IS NULL;

UPDATE "receipt_items" SET "quantity_rejected" = '0' WHERE "quantity_rejected" IS NULL;

-- Receipts: phê duyệt nhập dư
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "variance_approved_by" uuid;
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "variance_approved_at" timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_variance_approved_by_users_id_fk'
  ) THEN
    ALTER TABLE "receipts"
      ADD CONSTRAINT "receipts_variance_approved_by_users_id_fk"
      FOREIGN KEY ("variance_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- Transaction types cho sản xuất
DO $enum$
BEGIN
  ALTER TYPE "transaction_type" ADD VALUE 'production_consume';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enum$;

DO $enum$
BEGIN
  ALTER TYPE "transaction_type" ADD VALUE 'production_output';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enum$;
