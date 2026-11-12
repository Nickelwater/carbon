-- ProPunch hardware timeclock: enrollId, devices, punch staging
-- RLS is owned by the authz manifest (Task 3) — no CREATE POLICY here.

-- employeeJob.enrollId
ALTER TABLE "employeeJob" ADD COLUMN IF NOT EXISTS "enrollId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "employeeJob_companyId_enrollId_key"
  ON "employeeJob" ("companyId", "enrollId")
  WHERE "enrollId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "timeClockDevice" (
  "id" TEXT NOT NULL DEFAULT id('tcd'),
  "companyId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "autoPoll" BOOLEAN NOT NULL DEFAULT FALSE,
  "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
  "lastSeenAt" TIMESTAMP WITH TIME ZONE,
  "lastRegAt" TIMESTAMP WITH TIME ZONE,
  "firmware" TEXT,
  "modelName" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "timeClockDevice_companyId_idx" ON "timeClockDevice" ("companyId");
CREATE INDEX IF NOT EXISTS "timeClockDevice_createdBy_idx" ON "timeClockDevice" ("createdBy");
ALTER TABLE "timeClockDevice" DROP CONSTRAINT IF EXISTS "timeClockDevice_companyId_serialNumber_key";
ALTER TABLE "timeClockDevice" ADD CONSTRAINT "timeClockDevice_companyId_serialNumber_key"
  UNIQUE ("companyId", "serialNumber");

CREATE TABLE IF NOT EXISTS "timeClockPunch" (
  "id" TEXT NOT NULL DEFAULT id('tcp'),
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "enrollId" TEXT NOT NULL,
  "punchedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "inout" INTEGER,
  "event" INTEGER NOT NULL DEFAULT 0,
  "mode" INTEGER NOT NULL DEFAULT 0,
  "raw" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "employeeId" TEXT,
  "timeCardEntryId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("deviceId", "companyId") REFERENCES "timeClockDevice"("id", "companyId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "timeClockPunch_companyId_idx" ON "timeClockPunch" ("companyId");
CREATE INDEX IF NOT EXISTS "timeClockPunch_deviceId_idx" ON "timeClockPunch" ("deviceId", "companyId");
CREATE INDEX IF NOT EXISTS "timeClockPunch_status_idx" ON "timeClockPunch" ("companyId", "status");
ALTER TABLE "timeClockPunch" DROP CONSTRAINT IF EXISTS "timeClockPunch_idempotency_key";
ALTER TABLE "timeClockPunch" ADD CONSTRAINT "timeClockPunch_idempotency_key"
  UNIQUE ("companyId", "serialNumber", "enrollId", "punchedAt", "mode", "event");
ALTER TABLE "timeClockPunch" DROP CONSTRAINT IF EXISTS "timeClockPunch_status_check";
ALTER TABLE "timeClockPunch" ADD CONSTRAINT "timeClockPunch_status_check"
  CHECK ("status" IN ('pending', 'applied', 'unmapped', 'duplicate', 'error'));
