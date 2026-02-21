ALTER TABLE "maintenanceSchedule"
ADD COLUMN IF NOT EXISTS "locationId" TEXT NOT NULL;

UPDATE "maintenanceSchedule"
SET "locationId" = (
  SELECT "locationId" FROM "workCenter" WHERE "id" = "maintenanceSchedule"."workCenterId"
) WHERE "locationId" IS NULL AND "workCenterId" IS NOT NULL;

UPDATE "maintenanceDispatch"
SET "locationId" = (
  SELECT "locationId" FROM "workCenter" WHERE "id" = "maintenanceDispatch"."workCenterId"
) WHERE "locationId" IS NULL AND "workCenterId" IS NOT NULL;

DELETE FROM "maintenanceSchedule" WHERE "locationId" IS NULL;
DELETE FROM "maintenanceDispatch" WHERE "locationId" IS NULL;

ALTER TABLE "maintenanceSchedule"
ADD CONSTRAINT "maintenanceSchedule_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "location"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "maintenanceSchedule_locationId_idx" ON "maintenanceSchedule" ("locationId");

ALTER TABLE "maintenanceSchedule"
ADD COLUMN IF NOT EXISTS "procedureId" TEXT;

ALTER TABLE "maintenanceSchedule"
ADD CONSTRAINT "maintenanceSchedule_procedureId_fkey"
FOREIGN KEY ("procedureId") REFERENCES "procedure"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "maintenanceSchedule_procedureId_idx" ON "maintenanceSchedule" ("procedureId");

ALTER TABLE "maintenanceDispatch"
ADD COLUMN IF NOT EXISTS "procedureId" TEXT;

ALTER TABLE "maintenanceDispatch"
ADD CONSTRAINT "maintenanceDispatch_procedureId_fkey"
FOREIGN KEY ("procedureId") REFERENCES "procedure"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenanceSchedule"
ADD COLUMN IF NOT EXISTS "locationId" TEXT;

ALTER TABLE "maintenanceSchedule"
ADD CONSTRAINT "maintenanceSchedule_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "location"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "maintenanceSchedule_locationId_idx" ON "maintenanceSchedule" ("locationId");

