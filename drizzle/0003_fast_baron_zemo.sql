ALTER TYPE "public"."order_status" ADD VALUE 'picking' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'delivering' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'claimed';