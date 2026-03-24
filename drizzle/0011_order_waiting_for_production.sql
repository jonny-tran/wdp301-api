DO $$
BEGIN
  ALTER TYPE "order_status" ADD VALUE 'waiting_for_production';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
