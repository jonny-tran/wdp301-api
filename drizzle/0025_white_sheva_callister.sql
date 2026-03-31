ALTER TABLE "users" DROP CONSTRAINT "users_requested_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "requested_by_user_id";