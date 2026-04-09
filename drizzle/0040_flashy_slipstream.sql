ALTER TABLE "manifests" ADD COLUMN "driver_phone" text;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "vehicle_id" integer;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "overload_warning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;