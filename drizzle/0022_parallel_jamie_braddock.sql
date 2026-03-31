ALTER TYPE "public"."user_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'inactive';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."user_status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE "public"."user_status" USING "status"::"public"."user_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_request_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_rejection_reason" text;