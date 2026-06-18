-- Material supersession (phase 3): quantity conversion factor.
-- How many of the successor replace one of the old part (1 old = N new).
-- MRP multiplies redirected demand by this when moving it to the successor.
-- Default 1 = 1:1 (existing behaviour unchanged).

ALTER TABLE "itemSupersession"
  ADD COLUMN IF NOT EXISTS "conversionFactor" NUMERIC NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'itemSupersession_conversionFactor_check'
  ) THEN
    ALTER TABLE "itemSupersession"
      ADD CONSTRAINT "itemSupersession_conversionFactor_check"
        CHECK ("conversionFactor" > 0);
  END IF;
END $$;
