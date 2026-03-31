-- Mở rộng enum user_status (Postgres 15+: IF NOT EXISTS; nếu lỗi "already exists" có thể bỏ qua từng dòng)
ALTER TYPE "user_status" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "user_status" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "user_status" ADD VALUE IF NOT EXISTS 'inactive';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_rejection_reason" text;

ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "status" TYPE "user_status" USING (
    CASE upper(btrim("status"::text))
      WHEN 'ACTIVE' THEN 'active'::"user_status"
      WHEN 'BANNED' THEN 'banned'::"user_status"
      WHEN 'PENDING' THEN 'pending'::"user_status"
      WHEN 'REJECTED' THEN 'rejected'::"user_status"
      WHEN 'INACTIVE' THEN 'inactive'::"user_status"
      ELSE 'active'::"user_status"
    END
  );

ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::"user_status";
