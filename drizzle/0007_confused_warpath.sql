CREATE TABLE "base_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "base_units_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "base_unit" TO "base_unit_id";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_base_units_id_fk" FOREIGN KEY ("base_unit_id") REFERENCES "public"."base_units"("id") ON DELETE no action ON UPDATE no action;