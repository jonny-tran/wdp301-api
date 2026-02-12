-- Migration: Add updatedAt column to shipments table for 24-hour Golden Time Window validation

-- Add updatedAt column to shipments table
ALTER TABLE "shipments" ADD COLUMN "updated_at" timestamp DEFAULT now();

-- Update existing records to use created_at as initial value
UPDATE "shipments" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

-- Create index on status and updated_at for efficient 24-hour window queries
CREATE INDEX IF NOT EXISTS "idx_shipments_status_updated_at" ON "shipments" ("status", "updated_at");

-- Note: You should also set up a trigger to automatically update updated_at on status changes
-- This can be done in a separate migration or application logic
