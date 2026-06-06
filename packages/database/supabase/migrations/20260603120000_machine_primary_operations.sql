-- Machine-primary operations: setupRate, operatorAttention, GL setup rate for Setup events
-- After deploy, run: pnpm exec tsx scripts/recost-machine-primary.ts

ALTER TABLE "workCenter"
  ADD COLUMN IF NOT EXISTS "setupRate" NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE "methodOperation"
  ADD COLUMN IF NOT EXISTS "operatorAttention" NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE "quoteOperation"
  ADD COLUMN IF NOT EXISTS "operatorAttention" NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "setupRate" NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE "jobOperation"
  ADD COLUMN IF NOT EXISTS "operatorAttention" NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "setupRate" NUMERIC NOT NULL DEFAULT 0;

-- Backfill operator attention from legacy labor/run times
UPDATE "methodOperation"
SET "operatorAttention" = CASE
  WHEN COALESCE("machineTime", 0) <= 0 THEN 1
  WHEN COALESCE("laborTime", 0) <= 0 THEN 0
  ELSE "laborTime" / "machineTime"
END
WHERE "operationType" = 'Inside';

UPDATE "quoteOperation"
SET "operatorAttention" = CASE
  WHEN COALESCE("machineTime", 0) <= 0 THEN 1
  WHEN COALESCE("laborTime", 0) <= 0 THEN 0
  ELSE "laborTime" / "machineTime"
END
WHERE "operationType" = 'Inside';

UPDATE "jobOperation"
SET "operatorAttention" = CASE
  WHEN COALESCE("machineTime", 0) <= 0 THEN 1
  WHEN COALESCE("laborTime", 0) <= 0 THEN 0
  ELSE "laborTime" / "machineTime"
END
WHERE "operationType" = 'Inside';

-- Backfill setupRate on quote/job operations from work center
UPDATE "quoteOperation" qo
SET "setupRate" = wc."setupRate"
FROM "workCenter" wc
WHERE qo."workCenterId" = wc.id
  AND qo."operationType" = 'Inside';

UPDATE "jobOperation" jo
SET "setupRate" = wc."setupRate"
FROM "workCenter" wc
WHERE jo."workCenterId" = wc.id
  AND jo."operationType" = 'Inside';

-- Hourly rate for production event GL absorption by event type
CREATE OR REPLACE FUNCTION production_event_hourly_rate(
  p_type "productionEventType",
  p_setup_rate NUMERIC,
  p_labor_rate NUMERIC,
  p_machine_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'Machine' THEN COALESCE(p_machine_rate, 0)
    WHEN 'Setup' THEN COALESCE(p_setup_rate, 0)
    ELSE COALESCE(p_labor_rate, 0)
  END;
$$;

