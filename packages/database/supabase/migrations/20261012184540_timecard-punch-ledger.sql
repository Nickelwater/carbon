-- Timecard punch ledger (source of truth) + configurable pay periods.
-- RLS for timeCardPunch is owned by the authz manifest.

-- Pay period settings (defaults match Monday–Sunday week behavior)
ALTER TABLE "companySettings"
  ADD COLUMN IF NOT EXISTS "payPeriodLengthDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "companySettings"
  ADD COLUMN IF NOT EXISTS "payPeriodAnchorDate" DATE;

UPDATE "companySettings"
SET "payPeriodAnchorDate" = date_trunc('week', CURRENT_DATE)::date
WHERE "payPeriodAnchorDate" IS NULL;

ALTER TABLE "companySettings"
  ALTER COLUMN "payPeriodAnchorDate" SET DEFAULT (date_trunc('week', CURRENT_DATE)::date);

ALTER TABLE "companySettings"
  ALTER COLUMN "payPeriodAnchorDate" SET NOT NULL;

ALTER TABLE "companySettings" DROP CONSTRAINT IF EXISTS "companySettings_payPeriodLengthDays_check";
ALTER TABLE "companySettings" ADD CONSTRAINT "companySettings_payPeriodLengthDays_check"
  CHECK ("payPeriodLengthDays" IN (7, 14));

-- Canonical punch ledger
CREATE TABLE IF NOT EXISTS "timeCardPunch" (
  "id" TEXT NOT NULL DEFAULT id('tcpn'),
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "punchedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "source" TEXT NOT NULL,
  "timeClockPunchId" TEXT,
  "note" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "timeCardPunch_companyId_idx" ON "timeCardPunch" ("companyId");
CREATE INDEX IF NOT EXISTS "timeCardPunch_employeeId_idx" ON "timeCardPunch" ("employeeId", "companyId");
CREATE INDEX IF NOT EXISTS "timeCardPunch_punchedAt_idx" ON "timeCardPunch" ("companyId", "employeeId", "punchedAt");
CREATE INDEX IF NOT EXISTS "timeCardPunch_createdBy_idx" ON "timeCardPunch" ("createdBy");
CREATE INDEX IF NOT EXISTS "timeCardPunch_timeClockPunchId_idx"
  ON "timeCardPunch" ("timeClockPunchId", "companyId")
  WHERE "timeClockPunchId" IS NOT NULL;

ALTER TABLE "timeCardPunch" DROP CONSTRAINT IF EXISTS "timeCardPunch_source_check";
ALTER TABLE "timeCardPunch" ADD CONSTRAINT "timeCardPunch_source_check"
  CHECK ("source" IN ('hardware', 'manual', 'mes', 'migrated'));

-- Optional link to staged hardware punch (same company)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timeCardPunch_timeClockPunchId_fkey'
  ) THEN
    ALTER TABLE "timeCardPunch"
      ADD CONSTRAINT "timeCardPunch_timeClockPunchId_fkey"
      FOREIGN KEY ("timeClockPunchId", "companyId")
      REFERENCES "timeClockPunch"("id", "companyId")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill punches from existing interval entries
INSERT INTO "timeCardPunch" (
  "companyId",
  "employeeId",
  "punchedAt",
  "source",
  "createdBy",
  "createdAt"
)
SELECT
  tce."companyId",
  tce."employeeId",
  tce."clockIn",
  'migrated',
  tce."createdBy",
  tce."createdAt"
FROM "timeCardEntry" tce
WHERE NOT EXISTS (
  SELECT 1 FROM "timeCardPunch" p
  WHERE p."companyId" = tce."companyId"
    AND p."employeeId" = tce."employeeId"
    AND p."punchedAt" = tce."clockIn"
    AND p."source" = 'migrated'
);

INSERT INTO "timeCardPunch" (
  "companyId",
  "employeeId",
  "punchedAt",
  "source",
  "createdBy",
  "createdAt"
)
SELECT
  tce."companyId",
  tce."employeeId",
  tce."clockOut",
  'migrated',
  COALESCE(tce."updatedBy", tce."createdBy"),
  COALESCE(tce."updatedAt", tce."createdAt")
FROM "timeCardEntry" tce
WHERE tce."clockOut" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "timeCardPunch" p
    WHERE p."companyId" = tce."companyId"
      AND p."employeeId" = tce."employeeId"
      AND p."punchedAt" = tce."clockOut"
      AND p."source" = 'migrated'
  );
