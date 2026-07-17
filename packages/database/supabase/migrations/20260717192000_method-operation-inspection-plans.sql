-- Phase 3.1: method/job operation inspection plans + In-Process provenance columns

CREATE TYPE "inProcessTriggerType" AS ENUM ('Quantity', 'ElapsedTime');
CREATE TYPE "inProcessReaction" AS ENUM ('Notify', 'BlockFinish');

-- ============================================================================
-- methodOperationInspectionPlan (master on routing operation)
-- ============================================================================

CREATE TABLE "methodOperationInspectionPlan" (
  "id" TEXT NOT NULL DEFAULT id('moip'),
  "companyId" TEXT NOT NULL,
  "methodOperationId" TEXT NOT NULL,
  "inspectionDocumentId" TEXT,
  "triggerType" "inProcessTriggerType" NOT NULL DEFAULT 'Quantity',
  "firstTriggerAt" NUMERIC NOT NULL DEFAULT 1,
  "interval" NUMERIC NOT NULL DEFAULT 1,
  "samplesPerRun" INTEGER NOT NULL DEFAULT 1,
  "requiredForLotAcceptance" BOOLEAN NOT NULL DEFAULT false,
  "reaction" "inProcessReaction" NOT NULL DEFAULT 'Notify',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("methodOperationId") REFERENCES "methodOperation"("id") ON DELETE CASCADE
);

CREATE INDEX "methodOperationInspectionPlan_companyId_idx"
  ON "methodOperationInspectionPlan" ("companyId");
CREATE INDEX "methodOperationInspectionPlan_methodOperationId_idx"
  ON "methodOperationInspectionPlan" ("methodOperationId");
CREATE INDEX "methodOperationInspectionPlan_inspectionDocumentId_idx"
  ON "methodOperationInspectionPlan" ("inspectionDocumentId");
CREATE INDEX "methodOperationInspectionPlan_createdBy_idx"
  ON "methodOperationInspectionPlan" ("createdBy");

DO $$ BEGIN
  ALTER TABLE "methodOperationInspectionPlan"
    ADD CONSTRAINT "methodOperationInspectionPlan_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."methodOperationInspectionPlan" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."methodOperationInspectionPlan"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."methodOperationInspectionPlan"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."methodOperationInspectionPlan"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."methodOperationInspectionPlan"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- jobOperationInspectionPlan (snapshot copied in get-method)
-- ============================================================================

CREATE TABLE "jobOperationInspectionPlan" (
  "id" TEXT NOT NULL DEFAULT id('joip'),
  "companyId" TEXT NOT NULL,
  "jobOperationId" TEXT NOT NULL,
  "methodOperationInspectionPlanId" TEXT,
  "inspectionDocumentId" TEXT,
  "triggerType" "inProcessTriggerType" NOT NULL DEFAULT 'Quantity',
  "firstTriggerAt" NUMERIC NOT NULL DEFAULT 1,
  "interval" NUMERIC NOT NULL DEFAULT 1,
  "samplesPerRun" INTEGER NOT NULL DEFAULT 1,
  "requiredForLotAcceptance" BOOLEAN NOT NULL DEFAULT false,
  "reaction" "inProcessReaction" NOT NULL DEFAULT 'Notify',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("jobOperationId") REFERENCES "jobOperation"("id") ON DELETE CASCADE
);

CREATE INDEX "jobOperationInspectionPlan_companyId_idx"
  ON "jobOperationInspectionPlan" ("companyId");
CREATE INDEX "jobOperationInspectionPlan_jobOperationId_idx"
  ON "jobOperationInspectionPlan" ("jobOperationId");
CREATE INDEX "jobOperationInspectionPlan_methodPlanId_idx"
  ON "jobOperationInspectionPlan" ("methodOperationInspectionPlanId");
CREATE INDEX "jobOperationInspectionPlan_inspectionDocumentId_idx"
  ON "jobOperationInspectionPlan" ("inspectionDocumentId");
CREATE INDEX "jobOperationInspectionPlan_createdBy_idx"
  ON "jobOperationInspectionPlan" ("createdBy");

DO $$ BEGIN
  ALTER TABLE "jobOperationInspectionPlan"
    ADD CONSTRAINT "jobOperationInspectionPlan_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."jobOperationInspectionPlan" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."jobOperationInspectionPlan"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."jobOperationInspectionPlan"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."jobOperationInspectionPlan"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."jobOperationInspectionPlan"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionInProcess provenance columns
-- ============================================================================

ALTER TABLE "inspectionInProcess"
  ADD COLUMN IF NOT EXISTS "jobOperationInspectionPlanId" TEXT,
  ADD COLUMN IF NOT EXISTS "triggerType" "inProcessTriggerType",
  ADD COLUMN IF NOT EXISTS "triggerOrdinal" INTEGER,
  ADD COLUMN IF NOT EXISTS "triggerThreshold" NUMERIC,
  ADD COLUMN IF NOT EXISTS "triggerProductionQuantityId" TEXT,
  ADD COLUMN IF NOT EXISTS "triggerProductionEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "samplesPerRun" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "requiredForLotAcceptance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reaction" "inProcessReaction" NOT NULL DEFAULT 'Notify';

CREATE INDEX IF NOT EXISTS "inspectionInProcess_planId_idx"
  ON "inspectionInProcess" ("jobOperationInspectionPlanId");
CREATE INDEX IF NOT EXISTS "inspectionInProcess_triggerOrdinal_idx"
  ON "inspectionInProcess" ("jobOperationInspectionPlanId", "triggerType", "triggerOrdinal");

CREATE UNIQUE INDEX IF NOT EXISTS "inspectionInProcess_plan_trigger_ordinal_key"
  ON "inspectionInProcess" (
    "jobOperationInspectionPlanId",
    "triggerType",
    "triggerOrdinal",
    "companyId"
  )
  WHERE "jobOperationInspectionPlanId" IS NOT NULL
    AND "triggerType" IS NOT NULL
    AND "triggerOrdinal" IS NOT NULL;
