CREATE TYPE "production_order_status" AS ENUM ('draft', 'in_progress', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS "recipes" (
  "id" serial PRIMARY KEY NOT NULL,
  "output_product_id" integer NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_output_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "recipes"
      ADD CONSTRAINT "recipes_output_product_id_products_id_fk"
      FOREIGN KEY ("output_product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "recipe_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "recipe_id" integer NOT NULL,
  "ingredient_product_id" integer NOT NULL,
  "quantity_per_output" numeric NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipe_items_recipe_id_recipes_id_fk'
  ) THEN
    ALTER TABLE "recipe_items"
      ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk"
      FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipe_items_ingredient_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "recipe_items"
      ADD CONSTRAINT "recipe_items_ingredient_product_id_products_id_fk"
      FOREIGN KEY ("ingredient_product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "production_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" integer NOT NULL,
  "warehouse_id" integer NOT NULL,
  "output_quantity" numeric NOT NULL,
  "status" "production_order_status" DEFAULT 'draft' NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_recipe_id_recipes_id_fk'
  ) THEN
    ALTER TABLE "production_orders"
      ADD CONSTRAINT "production_orders_recipe_id_recipes_id_fk"
      FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_warehouse_id_warehouses_id_fk'
  ) THEN
    ALTER TABLE "production_orders"
      ADD CONSTRAINT "production_orders_warehouse_id_warehouses_id_fk"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "production_orders"
      ADD CONSTRAINT "production_orders_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "production_reservations" (
  "id" serial PRIMARY KEY NOT NULL,
  "production_order_id" uuid NOT NULL,
  "batch_id" integer NOT NULL,
  "reserved_quantity" numeric NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_reservations_production_order_id_production_orders_id_fk'
  ) THEN
    ALTER TABLE "production_reservations"
      ADD CONSTRAINT "production_reservations_production_order_id_production_orders_id_fk"
      FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_reservations_batch_id_batches_id_fk'
  ) THEN
    ALTER TABLE "production_reservations"
      ADD CONSTRAINT "production_reservations_batch_id_batches_id_fk"
      FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_production_orders_status" ON "production_orders" ("status");
