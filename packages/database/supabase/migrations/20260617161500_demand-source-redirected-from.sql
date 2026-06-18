-- Material supersession (phase 3 visibility): record which old part a redirected
-- demand came from, so the planning demand popover can show
-- "X redirected from <old part>" on the successor.
--
-- The MRP engine stamps redirectedFromItemId on demandForecastSource rows whose
-- demand was moved from a discontinued part to its successor (top-level
-- redirection and BOM component substitution).

ALTER TABLE "demandForecastSource"
  ADD COLUMN IF NOT EXISTS "redirectedFromItemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demandForecastSource_redirectedFromItemId_fkey'
  ) THEN
    ALTER TABLE "demandForecastSource"
      ADD CONSTRAINT "demandForecastSource_redirectedFromItemId_fkey"
        FOREIGN KEY ("redirectedFromItemId") REFERENCES "item"("id")
        ON DELETE SET NULL;
  END IF;
END $$;
