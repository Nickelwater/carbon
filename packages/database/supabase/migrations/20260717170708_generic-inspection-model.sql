-- Phase 2: generic inspection header + subtype tables, backfill from inboundInspection*,
-- itemInspectionPolicy, dormant inspectionDependency, temporary legacy↔generic sync triggers,
-- and inProcessInspection (IP) sequence seed.

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "inspectionType" AS ENUM ('Inbound', 'Lot', 'InProcess');

CREATE TYPE "inspectionDependencyStatus" AS ENUM (
  'Pending',
  'Satisfied',
  'Failed',
  'Waived',
  'Cancelled'
);

-- ============================================================================
-- Helper: quality RLS policies (match inboundInspection family: quality_view writes)
-- ============================================================================

-- ============================================================================
-- inspection (generic header — preserves legacy inboundInspection.id / readable id)
-- ============================================================================

CREATE TABLE "inspection" (
  "id" TEXT NOT NULL DEFAULT id('insp'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "type" "inspectionType" NOT NULL,
  "itemId" TEXT NOT NULL REFERENCES "item"("id") ON UPDATE CASCADE,
  "itemReadableId" TEXT,
  "supplierId" TEXT REFERENCES "supplier"("id") ON UPDATE CASCADE,
  "lotSize" NUMERIC NOT NULL,
  "samplingStandard" "samplingStandard" NOT NULL,
  "samplingPlanType" "samplingPlanType" NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "acceptanceNumber" INTEGER NOT NULL,
  "rejectionNumber" INTEGER NOT NULL,
  "aql" NUMERIC,
  "inspectionLevel" "inspectionLevel",
  "severity" "inspectionSeverity",
  "codeLetter" TEXT,
  "inspectionDocumentId" TEXT,
  "status" "inboundInspectionStatus" NOT NULL DEFAULT 'Pending',
  "notes" TEXT,
  "dispositionedBy" TEXT REFERENCES "user"("id") ON UPDATE CASCADE,
  "dispositionedAt" TIMESTAMP WITH TIME ZONE,
  -- Snapshot for Job Inventory reject ledger (and receipt convenience)
  "locationId" TEXT,
  "storageUnitId" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE
);

CREATE INDEX "inspection_companyId_idx" ON "inspection" ("companyId");
CREATE INDEX "inspection_inspectionId_idx" ON "inspection" ("inspectionId");
CREATE INDEX "inspection_type_idx" ON "inspection" ("type");
CREATE INDEX "inspection_status_idx" ON "inspection" ("status");
CREATE INDEX "inspection_itemId_idx" ON "inspection" ("itemId");
CREATE INDEX "inspection_supplierId_idx" ON "inspection" ("supplierId");
CREATE INDEX "inspection_inspectionDocumentId_idx" ON "inspection" ("inspectionDocumentId");
CREATE INDEX "inspection_locationId_idx" ON "inspection" ("locationId");
CREATE INDEX "inspection_dispositionedBy_idx" ON "inspection" ("dispositionedBy");
CREATE INDEX "inspection_createdBy_idx" ON "inspection" ("createdBy");

ALTER TABLE "inspection" ADD CONSTRAINT "inspection_inspectionId_companyId_key"
  UNIQUE ("inspectionId", "companyId");

DO $$ BEGIN
  ALTER TABLE "inspection"
    ADD CONSTRAINT "inspection_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."inspection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspection"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspection"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspection"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspection"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionReceipt
-- ============================================================================

CREATE TABLE "inspectionReceipt" (
  "id" TEXT NOT NULL DEFAULT id('inspr'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL REFERENCES "receipt"("id") ON DELETE CASCADE,
  "receiptLineId" TEXT NOT NULL REFERENCES "receiptLine"("id") ON DELETE CASCADE,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionReceipt_companyId_idx" ON "inspectionReceipt" ("companyId");
CREATE INDEX "inspectionReceipt_inspectionId_idx" ON "inspectionReceipt" ("inspectionId");
CREATE INDEX "inspectionReceipt_receiptId_idx" ON "inspectionReceipt" ("receiptId");
CREATE INDEX "inspectionReceipt_receiptLineId_idx" ON "inspectionReceipt" ("receiptLineId");
CREATE INDEX "inspectionReceipt_createdBy_idx" ON "inspectionReceipt" ("createdBy");

ALTER TABLE "inspectionReceipt" ADD CONSTRAINT "inspectionReceipt_inspectionId_companyId_key"
  UNIQUE ("inspectionId", "companyId");

ALTER TABLE "inspectionReceipt" ADD CONSTRAINT "inspectionReceipt_receiptLineId_key"
  UNIQUE ("receiptLineId");

ALTER TABLE "public"."inspectionReceipt" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionReceipt"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionReceipt"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionReceipt"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionReceipt"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionLot
-- ============================================================================

CREATE TABLE "inspectionLot" (
  "id" TEXT NOT NULL DEFAULT id('inspl'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL REFERENCES "job"("id") ON DELETE CASCADE,
  "jobOperationId" TEXT REFERENCES "jobOperation"("id") ON DELETE SET NULL,
  "outputLotKey" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionLot_companyId_idx" ON "inspectionLot" ("companyId");
CREATE INDEX "inspectionLot_inspectionId_idx" ON "inspectionLot" ("inspectionId");
CREATE INDEX "inspectionLot_jobId_idx" ON "inspectionLot" ("jobId");
CREATE INDEX "inspectionLot_jobOperationId_idx" ON "inspectionLot" ("jobOperationId");
CREATE INDEX "inspectionLot_outputLotKey_idx" ON "inspectionLot" ("outputLotKey");
CREATE INDEX "inspectionLot_createdBy_idx" ON "inspectionLot" ("createdBy");

ALTER TABLE "inspectionLot" ADD CONSTRAINT "inspectionLot_inspectionId_companyId_key"
  UNIQUE ("inspectionId", "companyId");

ALTER TABLE "inspectionLot" ADD CONSTRAINT "inspectionLot_outputLotKey_companyId_key"
  UNIQUE ("outputLotKey", "companyId");

ALTER TABLE "public"."inspectionLot" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionLot"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionLot"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionLot"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionLot"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionInProcess (shell until Phase 3)
-- ============================================================================

CREATE TABLE "inspectionInProcess" (
  "id" TEXT NOT NULL DEFAULT id('inspp'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL REFERENCES "job"("id") ON DELETE CASCADE,
  "jobOperationId" TEXT NOT NULL REFERENCES "jobOperation"("id") ON DELETE CASCADE,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionInProcess_companyId_idx" ON "inspectionInProcess" ("companyId");
CREATE INDEX "inspectionInProcess_inspectionId_idx" ON "inspectionInProcess" ("inspectionId");
CREATE INDEX "inspectionInProcess_jobId_idx" ON "inspectionInProcess" ("jobId");
CREATE INDEX "inspectionInProcess_jobOperationId_idx" ON "inspectionInProcess" ("jobOperationId");
CREATE INDEX "inspectionInProcess_createdBy_idx" ON "inspectionInProcess" ("createdBy");

ALTER TABLE "inspectionInProcess" ADD CONSTRAINT "inspectionInProcess_inspectionId_companyId_key"
  UNIQUE ("inspectionId", "companyId");

ALTER TABLE "public"."inspectionInProcess" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionInProcess"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionInProcess"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionInProcess"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionInProcess"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionSample
-- ============================================================================

CREATE TABLE "inspectionSample" (
  "id" TEXT NOT NULL DEFAULT id('insps'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "trackedEntityId" TEXT REFERENCES "trackedEntity"("id") ON DELETE CASCADE,
  "sampleIndex" INTEGER NOT NULL DEFAULT 1,
  "status" "inboundInspectionSampleStatus" NOT NULL DEFAULT 'Pending',
  "statusOverridden" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "inspectedBy" TEXT REFERENCES "user"("id") ON UPDATE CASCADE,
  "inspectedAt" TIMESTAMP WITH TIME ZONE,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionSample_companyId_idx" ON "inspectionSample" ("companyId");
CREATE INDEX "inspectionSample_inspectionId_idx" ON "inspectionSample" ("inspectionId");
CREATE INDEX "inspectionSample_trackedEntityId_idx" ON "inspectionSample" ("trackedEntityId");
CREATE INDEX "inspectionSample_status_idx" ON "inspectionSample" ("status");
CREATE INDEX "inspectionSample_inspectedBy_idx" ON "inspectionSample" ("inspectedBy");
CREATE INDEX "inspectionSample_createdBy_idx" ON "inspectionSample" ("createdBy");

-- Batch: multiple samples per entity via sampleIndex; serial: one entity across lots
-- still allowed once per (inspection, entity, index). Anonymous: unique by index.
CREATE UNIQUE INDEX "inspectionSample_entity_sample_idx"
  ON "inspectionSample" ("inspectionId", "trackedEntityId", "sampleIndex", "companyId")
  WHERE "trackedEntityId" IS NOT NULL;

CREATE UNIQUE INDEX "inspectionSample_anonymous_sample_idx"
  ON "inspectionSample" ("inspectionId", "sampleIndex", "companyId")
  WHERE "trackedEntityId" IS NULL;

ALTER TABLE "public"."inspectionSample" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionSample"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionSample"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionSample"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionSample"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionSampleMeasurement
-- ============================================================================

CREATE TABLE "inspectionSampleMeasurement" (
  "id" TEXT NOT NULL DEFAULT id('inspm'),
  "companyId" TEXT NOT NULL,
  "inspectionSampleId" TEXT NOT NULL,
  "inspectionFeatureId" TEXT NOT NULL REFERENCES "inspectionFeature"("id") ON DELETE CASCADE,
  "measuredValue" TEXT,
  "measuredValueNumeric" NUMERIC,
  "inTolerance" BOOLEAN,
  "gaugeId" TEXT,
  "gaugeOverride" BOOLEAN NOT NULL DEFAULT false,
  "gaugeOverrideReason" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionSampleId", "companyId")
    REFERENCES "inspectionSample"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionSampleMeasurement_companyId_idx"
  ON "inspectionSampleMeasurement" ("companyId");
CREATE INDEX "inspectionSampleMeasurement_sampleId_idx"
  ON "inspectionSampleMeasurement" ("inspectionSampleId");
CREATE INDEX "inspectionSampleMeasurement_featureId_idx"
  ON "inspectionSampleMeasurement" ("inspectionFeatureId");
CREATE INDEX "inspectionSampleMeasurement_gaugeId_idx"
  ON "inspectionSampleMeasurement" ("gaugeId");
CREATE INDEX "inspectionSampleMeasurement_createdBy_idx"
  ON "inspectionSampleMeasurement" ("createdBy");

ALTER TABLE "inspectionSampleMeasurement"
  ADD CONSTRAINT "inspectionSampleMeasurement_sample_feature_key"
  UNIQUE ("inspectionSampleId", "inspectionFeatureId", "companyId");

ALTER TABLE "public"."inspectionSampleMeasurement" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionSampleMeasurement"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionSampleMeasurement"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionSampleMeasurement"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionSampleMeasurement"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionHistory
-- ============================================================================

CREATE TABLE "inspectionHistory" (
  "id" TEXT NOT NULL DEFAULT id('insph'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL REFERENCES "item"("id") ON UPDATE CASCADE,
  "supplierId" TEXT REFERENCES "supplier"("id") ON UPDATE CASCADE,
  "samplingStandard" "samplingStandard" NOT NULL,
  "severity" "inspectionSeverity" NOT NULL,
  "inspectionLevel" "inspectionLevel",
  "aql" NUMERIC,
  "lotSize" NUMERIC NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "defectsFound" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionHistory_companyId_idx" ON "inspectionHistory" ("companyId");
CREATE INDEX "inspectionHistory_inspectionId_idx" ON "inspectionHistory" ("inspectionId");
CREATE INDEX "inspectionHistory_item_supplier_created_idx"
  ON "inspectionHistory" ("itemId", "supplierId", "createdAt" DESC);
CREATE INDEX "inspectionHistory_createdBy_idx" ON "inspectionHistory" ("createdBy");

ALTER TABLE "public"."inspectionHistory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionHistory"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionHistory"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionHistory"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionHistory"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionTrackedEntity
-- ============================================================================

CREATE TABLE "inspectionTrackedEntity" (
  "id" TEXT NOT NULL DEFAULT id('inspt'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "trackedEntityId" TEXT NOT NULL REFERENCES "trackedEntity"("id") ON DELETE CASCADE,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionTrackedEntity_companyId_idx" ON "inspectionTrackedEntity" ("companyId");
CREATE INDEX "inspectionTrackedEntity_inspectionId_idx" ON "inspectionTrackedEntity" ("inspectionId");
CREATE INDEX "inspectionTrackedEntity_trackedEntityId_idx"
  ON "inspectionTrackedEntity" ("trackedEntityId");
CREATE INDEX "inspectionTrackedEntity_createdBy_idx" ON "inspectionTrackedEntity" ("createdBy");

ALTER TABLE "inspectionTrackedEntity"
  ADD CONSTRAINT "inspectionTrackedEntity_inspection_entity_key"
  UNIQUE ("inspectionId", "trackedEntityId", "companyId");

ALTER TABLE "public"."inspectionTrackedEntity" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionTrackedEntity"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionTrackedEntity"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionTrackedEntity"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionTrackedEntity"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- inspectionDependency (dormant until Phase 3)
-- ============================================================================

CREATE TABLE "inspectionDependency" (
  "id" TEXT NOT NULL DEFAULT id('inspd'),
  "companyId" TEXT NOT NULL,
  "dependentInspectionId" TEXT NOT NULL,
  "prerequisiteInspectionId" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" "inspectionDependencyStatus" NOT NULL DEFAULT 'Pending',
  "waivedBy" TEXT REFERENCES "user"("id"),
  "waivedAt" TIMESTAMP WITH TIME ZONE,
  "waiveReason" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("dependentInspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE,
  FOREIGN KEY ("prerequisiteInspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "inspectionDependency_companyId_idx" ON "inspectionDependency" ("companyId");
CREATE INDEX "inspectionDependency_dependent_idx"
  ON "inspectionDependency" ("dependentInspectionId");
CREATE INDEX "inspectionDependency_prerequisite_idx"
  ON "inspectionDependency" ("prerequisiteInspectionId");
CREATE INDEX "inspectionDependency_createdBy_idx" ON "inspectionDependency" ("createdBy");

ALTER TABLE "inspectionDependency"
  ADD CONSTRAINT "inspectionDependency_pair_key"
  UNIQUE ("dependentInspectionId", "prerequisiteInspectionId", "companyId");

ALTER TABLE "public"."inspectionDependency" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."inspectionDependency"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."inspectionDependency"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."inspectionDependency"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."inspectionDependency"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- nonConformanceInspection
-- ============================================================================

CREATE TABLE "nonConformanceInspection" (
  "id" TEXT NOT NULL DEFAULT id('nci'),
  "companyId" TEXT NOT NULL,
  "nonConformanceId" TEXT NOT NULL REFERENCES "nonConformance"("id") ON DELETE CASCADE,
  "inspectionId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("inspectionId", "companyId")
    REFERENCES "inspection"("id", "companyId") ON DELETE CASCADE
);

CREATE INDEX "nonConformanceInspection_companyId_idx" ON "nonConformanceInspection" ("companyId");
CREATE INDEX "nonConformanceInspection_nonConformanceId_idx"
  ON "nonConformanceInspection" ("nonConformanceId");
CREATE INDEX "nonConformanceInspection_inspectionId_idx"
  ON "nonConformanceInspection" ("inspectionId");
CREATE INDEX "nonConformanceInspection_createdBy_idx" ON "nonConformanceInspection" ("createdBy");

ALTER TABLE "nonConformanceInspection"
  ADD CONSTRAINT "nonConformanceInspection_pair_key"
  UNIQUE ("nonConformanceId", "inspectionId", "companyId");

ALTER TABLE "public"."nonConformanceInspection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."nonConformanceInspection"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."nonConformanceInspection"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."nonConformanceInspection"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."nonConformanceInspection"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- itemInspectionPolicy (per item + type)
-- ============================================================================

CREATE TABLE "itemInspectionPolicy" (
  "id" TEXT NOT NULL DEFAULT id('iip'),
  "companyId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL REFERENCES "item"("id") ON DELETE CASCADE,
  "inspectionType" "inspectionType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "type" "samplingPlanType" NOT NULL DEFAULT 'All',
  "sampleSize" INTEGER,
  "percentage" NUMERIC,
  "aql" NUMERIC,
  "inspectionLevel" "inspectionLevel" NOT NULL DEFAULT 'II',
  "severity" "inspectionSeverity" NOT NULL DEFAULT 'Normal',
  "inspectionDocumentId" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE
);

CREATE INDEX "itemInspectionPolicy_companyId_idx" ON "itemInspectionPolicy" ("companyId");
CREATE INDEX "itemInspectionPolicy_itemId_idx" ON "itemInspectionPolicy" ("itemId");
CREATE INDEX "itemInspectionPolicy_inspectionDocumentId_idx"
  ON "itemInspectionPolicy" ("inspectionDocumentId");
CREATE INDEX "itemInspectionPolicy_createdBy_idx" ON "itemInspectionPolicy" ("createdBy");

ALTER TABLE "itemInspectionPolicy"
  ADD CONSTRAINT "itemInspectionPolicy_item_type_key"
  UNIQUE ("itemId", "companyId", "inspectionType");

DO $$ BEGIN
  ALTER TABLE "itemInspectionPolicy"
    ADD CONSTRAINT "itemInspectionPolicy_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."itemInspectionPolicy" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."itemInspectionPolicy"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);
CREATE POLICY "INSERT" ON "public"."itemInspectionPolicy"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);
CREATE POLICY "UPDATE" ON "public"."itemInspectionPolicy"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);
CREATE POLICY "DELETE" ON "public"."itemInspectionPolicy"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);

-- ============================================================================
-- Backfill: inspection header + subtypes
-- ============================================================================

INSERT INTO "inspection" (
  "id", "companyId", "inspectionId", "type", "itemId", "itemReadableId", "supplierId",
  "lotSize", "samplingStandard", "samplingPlanType", "sampleSize",
  "acceptanceNumber", "rejectionNumber", "aql", "inspectionLevel", "severity",
  "codeLetter", "inspectionDocumentId", "status", "notes",
  "dispositionedBy", "dispositionedAt", "locationId", "storageUnitId",
  "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  ii."id",
  ii."companyId",
  ii."inboundInspectionId",
  CASE WHEN ii."sourceType" = 'Job' THEN 'Lot'::"inspectionType" ELSE 'Inbound'::"inspectionType" END,
  ii."itemId",
  ii."itemReadableId",
  ii."supplierId",
  ii."lotSize",
  ii."samplingStandard",
  ii."samplingPlanType",
  ii."sampleSize",
  ii."acceptanceNumber",
  ii."rejectionNumber",
  ii."aql",
  ii."inspectionLevel",
  ii."severity",
  ii."codeLetter",
  ii."inspectionDocumentId",
  ii."status",
  ii."notes",
  ii."dispositionedBy",
  ii."dispositionedAt",
  COALESCE(rl."locationId", j."locationId"),
  rl."storageUnitId",
  ii."createdBy",
  ii."createdAt",
  ii."updatedBy",
  ii."updatedAt"
FROM "inboundInspection" ii
LEFT JOIN "receiptLine" rl ON rl."id" = ii."receiptLineId"
LEFT JOIN "job" j ON j."id" = ii."jobId";

INSERT INTO "inspectionReceipt" (
  "id", "companyId", "inspectionId", "receiptId", "receiptLineId",
  "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  id('inspr'),
  ii."companyId",
  ii."id",
  ii."receiptId",
  ii."receiptLineId",
  ii."createdBy",
  ii."createdAt",
  ii."updatedBy",
  ii."updatedAt"
FROM "inboundInspection" ii
WHERE ii."sourceType" = 'Receipt'
  AND ii."receiptId" IS NOT NULL
  AND ii."receiptLineId" IS NOT NULL;

INSERT INTO "inspectionLot" (
  "id", "companyId", "inspectionId", "jobId", "jobOperationId", "outputLotKey",
  "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  id('inspl'),
  ii."companyId",
  ii."id",
  ii."jobId",
  ii."jobOperationId",
  -- Stable key for historical single-completion lots
  'legacy:' || ii."id",
  ii."createdBy",
  ii."createdAt",
  ii."updatedBy",
  ii."updatedAt"
FROM "inboundInspection" ii
WHERE ii."sourceType" = 'Job'
  AND ii."jobId" IS NOT NULL;

-- Samples (preserve ids)
INSERT INTO "inspectionSample" (
  "id", "companyId", "inspectionId", "trackedEntityId", "sampleIndex",
  "status", "statusOverridden", "notes", "inspectedBy", "inspectedAt",
  "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  s."id",
  s."companyId",
  s."inboundInspectionId",
  s."trackedEntityId",
  COALESCE(s."sampleIndex", 1),
  s."status",
  COALESCE(s."statusOverridden", false),
  s."notes",
  s."inspectedBy",
  s."inspectedAt",
  s."createdBy",
  s."createdAt",
  s."updatedBy",
  s."updatedAt"
FROM "inboundInspectionSample" s
WHERE EXISTS (
  SELECT 1 FROM "inspection" i
  WHERE i."id" = s."inboundInspectionId" AND i."companyId" = s."companyId"
);

-- Measurements (preserve ids; parse numeric when possible)
INSERT INTO "inspectionSampleMeasurement" (
  "id", "companyId", "inspectionSampleId", "inspectionFeatureId",
  "measuredValue", "measuredValueNumeric", "inTolerance",
  "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  m."id",
  m."companyId",
  m."inboundInspectionSampleId",
  m."inspectionFeatureId",
  m."measuredValue",
  CASE
    WHEN m."measuredValue" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN m."measuredValue"::NUMERIC
    ELSE NULL
  END,
  m."inTolerance",
  m."createdBy",
  m."createdAt",
  m."updatedBy",
  m."updatedAt"
FROM "inboundInspectionSampleMeasurement" m
WHERE EXISTS (
  SELECT 1 FROM "inspectionSample" s
  WHERE s."id" = m."inboundInspectionSampleId" AND s."companyId" = m."companyId"
);

-- History (preserve ids)
INSERT INTO "inspectionHistory" (
  "id", "companyId", "inspectionId", "itemId", "supplierId",
  "samplingStandard", "severity", "inspectionLevel", "aql",
  "lotSize", "sampleSize", "defectsFound", "outcome",
  "createdBy", "createdAt", "updatedBy"
)
SELECT
  h."id",
  h."companyId",
  h."inboundInspectionId",
  h."itemId",
  h."supplierId",
  h."samplingStandard",
  h."severity",
  h."inspectionLevel",
  h."aql",
  h."lotSize",
  h."sampleSize",
  h."defectsFound",
  h."outcome",
  h."createdBy",
  h."createdAt",
  h."updatedBy"
FROM "inboundInspectionHistory" h
WHERE EXISTS (
  SELECT 1 FROM "inspection" i
  WHERE i."id" = h."inboundInspectionId" AND i."companyId" = h."companyId"
);

-- Tracked entities from attributes "Inspection Lot"; Receipt Line fallback for receipts
INSERT INTO "inspectionTrackedEntity" (
  "id", "companyId", "inspectionId", "trackedEntityId",
  "createdBy", "createdAt"
)
SELECT DISTINCT ON (te."id", ii."id", ii."companyId")
  id('inspt'),
  ii."companyId",
  ii."id",
  te."id",
  ii."createdBy",
  ii."createdAt"
FROM "inboundInspection" ii
JOIN "trackedEntity" te
  ON te."companyId" = ii."companyId"
 AND (
   te."attributes"->>'Inspection Lot' = ii."id"
   OR (
     ii."sourceType" = 'Receipt'
     AND ii."receiptLineId" IS NOT NULL
     AND te."attributes"->>'Receipt Line' = ii."receiptLineId"
   )
 )
ORDER BY te."id", ii."id", ii."companyId",
  CASE WHEN te."attributes"->>'Inspection Lot' = ii."id" THEN 0 ELSE 1 END;

-- NCR links
INSERT INTO "nonConformanceInspection" (
  "id", "companyId", "nonConformanceId", "inspectionId",
  "createdBy", "createdAt", "updatedBy"
)
SELECT
  n."id",
  n."companyId",
  n."nonConformanceId",
  n."inboundInspectionId",
  n."createdBy",
  n."createdAt",
  n."updatedBy"
FROM "nonConformanceInboundInspection" n
WHERE EXISTS (
  SELECT 1 FROM "inspection" i
  WHERE i."id" = n."inboundInspectionId" AND i."companyId" = n."companyId"
);

-- itemInspectionPolicy from requiresInspection + itemSamplingPlan (Inbound + Lot)
INSERT INTO "itemInspectionPolicy" (
  "id", "companyId", "itemId", "inspectionType", "required",
  "type", "sampleSize", "percentage", "aql", "inspectionLevel", "severity",
  "inspectionDocumentId", "createdBy", "createdAt", "updatedBy", "updatedAt"
)
SELECT
  id('iip'),
  i."companyId",
  i."id",
  t.inspection_type,
  COALESCE(i."requiresInspection", false),
  COALESCE(sp."type", 'All'::"samplingPlanType"),
  sp."sampleSize",
  sp."percentage",
  sp."aql",
  COALESCE(sp."inspectionLevel", 'II'::"inspectionLevel"),
  COALESCE(sp."severity", 'Normal'::"inspectionSeverity"),
  sp."inspectionDocumentId",
  COALESCE(sp."createdBy", i."createdBy"),
  COALESCE(sp."createdAt", i."createdAt", NOW()),
  sp."updatedBy",
  sp."updatedAt"
FROM "item" i
CROSS JOIN (
  SELECT 'Inbound'::"inspectionType" AS inspection_type
  UNION ALL
  SELECT 'Lot'::"inspectionType"
) t
LEFT JOIN "itemSamplingPlan" sp ON sp."itemId" = i."id"
WHERE COALESCE(i."requiresInspection", false) = true
   OR sp."itemId" IS NOT NULL;

-- ============================================================================
-- Assert counts / subtype exclusivity
-- ============================================================================

DO $$
DECLARE
  legacy_count BIGINT;
  generic_count BIGINT;
  receipt_count BIGINT;
  lot_count BIGINT;
  inbound_legacy BIGINT;
  job_legacy BIGINT;
  bad_subtypes BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_count FROM "inboundInspection";
  SELECT COUNT(*) INTO generic_count FROM "inspection";
  IF legacy_count <> generic_count THEN
    RAISE EXCEPTION 'inspection backfill count mismatch: legacy=% generic=%',
      legacy_count, generic_count;
  END IF;

  SELECT COUNT(*) INTO inbound_legacy FROM "inboundInspection" WHERE "sourceType" = 'Receipt';
  SELECT COUNT(*) INTO job_legacy FROM "inboundInspection" WHERE "sourceType" = 'Job';
  SELECT COUNT(*) INTO receipt_count FROM "inspectionReceipt";
  SELECT COUNT(*) INTO lot_count FROM "inspectionLot";

  IF inbound_legacy <> receipt_count THEN
    RAISE EXCEPTION 'inspectionReceipt backfill mismatch: legacy=% subtype=%',
      inbound_legacy, receipt_count;
  END IF;
  IF job_legacy <> lot_count THEN
    RAISE EXCEPTION 'inspectionLot backfill mismatch: legacy=% subtype=%',
      job_legacy, lot_count;
  END IF;

  SELECT COUNT(*) INTO bad_subtypes
  FROM "inspection" i
  WHERE (
    i."type" = 'Inbound' AND NOT EXISTS (
      SELECT 1 FROM "inspectionReceipt" r
      WHERE r."inspectionId" = i."id" AND r."companyId" = i."companyId"
    )
  ) OR (
    i."type" = 'Lot' AND NOT EXISTS (
      SELECT 1 FROM "inspectionLot" l
      WHERE l."inspectionId" = i."id" AND l."companyId" = i."companyId"
    )
  ) OR (
    i."type" = 'Inbound' AND EXISTS (
      SELECT 1 FROM "inspectionLot" l
      WHERE l."inspectionId" = i."id" AND l."companyId" = i."companyId"
    )
  ) OR (
    i."type" = 'Lot' AND EXISTS (
      SELECT 1 FROM "inspectionReceipt" r
      WHERE r."inspectionId" = i."id" AND r."companyId" = i."companyId"
    )
  );

  IF bad_subtypes > 0 THEN
    RAISE EXCEPTION 'inspection subtype exclusivity violated for % rows', bad_subtypes;
  END IF;
END $$;

-- ============================================================================
-- Seed inProcessInspection sequence (IP)
-- ============================================================================

INSERT INTO "sequence" ("table", "name", "prefix", "suffix", "next", "size", "step", "companyId")
SELECT
  'inProcessInspection',
  'In-Process Inspection',
  'IP',
  NULL,
  0,
  6,
  1,
  "id"
FROM "company"
ON CONFLICT ("table", "companyId") DO NOTHING;

-- ============================================================================
-- Compatibility sync triggers (legacy ↔ generic) for dual-write safety
-- ============================================================================

CREATE OR REPLACE FUNCTION inspection_sync_guard()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN COALESCE(current_setting('app.skip_inspection_sync', true), '') = '1';
END;
$$;

CREATE OR REPLACE FUNCTION inspection_sync_enter()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.skip_inspection_sync', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION inspection_sync_exit()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.skip_inspection_sync', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION sync_inbound_inspection_to_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type "inspectionType";
  v_location_id TEXT;
  v_storage_unit_id TEXT;
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  PERFORM inspection_sync_enter();

  v_type := CASE WHEN NEW."sourceType" = 'Job' THEN 'Lot'::"inspectionType" ELSE 'Inbound'::"inspectionType" END;

  IF NEW."sourceType" = 'Receipt' AND NEW."receiptLineId" IS NOT NULL THEN
    SELECT "locationId", "storageUnitId"
      INTO v_location_id, v_storage_unit_id
    FROM "receiptLine"
    WHERE "id" = NEW."receiptLineId";
  ELSIF NEW."sourceType" = 'Job' AND NEW."jobId" IS NOT NULL THEN
    SELECT "locationId" INTO v_location_id FROM "job" WHERE "id" = NEW."jobId";
  END IF;

  INSERT INTO "inspection" (
    "id", "companyId", "inspectionId", "type", "itemId", "itemReadableId", "supplierId",
    "lotSize", "samplingStandard", "samplingPlanType", "sampleSize",
    "acceptanceNumber", "rejectionNumber", "aql", "inspectionLevel", "severity",
    "codeLetter", "inspectionDocumentId", "status", "notes",
    "dispositionedBy", "dispositionedAt", "locationId", "storageUnitId",
    "createdBy", "createdAt", "updatedBy", "updatedAt"
  ) VALUES (
    NEW."id", NEW."companyId", NEW."inboundInspectionId", v_type, NEW."itemId",
    NEW."itemReadableId", NEW."supplierId", NEW."lotSize", NEW."samplingStandard",
    NEW."samplingPlanType", NEW."sampleSize", NEW."acceptanceNumber", NEW."rejectionNumber",
    NEW."aql", NEW."inspectionLevel", NEW."severity", NEW."codeLetter",
    NEW."inspectionDocumentId", NEW."status", NEW."notes", NEW."dispositionedBy",
    NEW."dispositionedAt", v_location_id, v_storage_unit_id,
    NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
  )
  ON CONFLICT ("id", "companyId") DO UPDATE SET
    "inspectionId" = EXCLUDED."inspectionId",
    "type" = EXCLUDED."type",
    "itemId" = EXCLUDED."itemId",
    "itemReadableId" = EXCLUDED."itemReadableId",
    "supplierId" = EXCLUDED."supplierId",
    "lotSize" = EXCLUDED."lotSize",
    "samplingStandard" = EXCLUDED."samplingStandard",
    "samplingPlanType" = EXCLUDED."samplingPlanType",
    "sampleSize" = EXCLUDED."sampleSize",
    "acceptanceNumber" = EXCLUDED."acceptanceNumber",
    "rejectionNumber" = EXCLUDED."rejectionNumber",
    "aql" = EXCLUDED."aql",
    "inspectionLevel" = EXCLUDED."inspectionLevel",
    "severity" = EXCLUDED."severity",
    "codeLetter" = EXCLUDED."codeLetter",
    "inspectionDocumentId" = EXCLUDED."inspectionDocumentId",
    "status" = EXCLUDED."status",
    "notes" = EXCLUDED."notes",
    "dispositionedBy" = EXCLUDED."dispositionedBy",
    "dispositionedAt" = EXCLUDED."dispositionedAt",
    "locationId" = COALESCE(EXCLUDED."locationId", "inspection"."locationId"),
    "storageUnitId" = COALESCE(EXCLUDED."storageUnitId", "inspection"."storageUnitId"),
    "updatedBy" = EXCLUDED."updatedBy",
    "updatedAt" = EXCLUDED."updatedAt";

  IF NEW."sourceType" = 'Receipt' AND NEW."receiptId" IS NOT NULL AND NEW."receiptLineId" IS NOT NULL THEN
    INSERT INTO "inspectionReceipt" (
      "companyId", "inspectionId", "receiptId", "receiptLineId",
      "createdBy", "createdAt", "updatedBy", "updatedAt"
    ) VALUES (
      NEW."companyId", NEW."id", NEW."receiptId", NEW."receiptLineId",
      NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
    )
    ON CONFLICT ("inspectionId", "companyId") DO UPDATE SET
      "receiptId" = EXCLUDED."receiptId",
      "receiptLineId" = EXCLUDED."receiptLineId",
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = EXCLUDED."updatedAt";
  END IF;

  IF NEW."sourceType" = 'Job' AND NEW."jobId" IS NOT NULL THEN
    INSERT INTO "inspectionLot" (
      "companyId", "inspectionId", "jobId", "jobOperationId", "outputLotKey",
      "createdBy", "createdAt", "updatedBy", "updatedAt"
    ) VALUES (
      NEW."companyId", NEW."id", NEW."jobId", NEW."jobOperationId",
      COALESCE(
        (SELECT "outputLotKey" FROM "inspectionLot"
         WHERE "inspectionId" = NEW."id" AND "companyId" = NEW."companyId"),
        'legacy:' || NEW."id"
      ),
      NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
    )
    ON CONFLICT ("inspectionId", "companyId") DO UPDATE SET
      "jobId" = EXCLUDED."jobId",
      "jobOperationId" = EXCLUDED."jobOperationId",
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = EXCLUDED."updatedAt";
  END IF;

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_generic_inspection_to_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_id TEXT;
  v_receipt_line_id TEXT;
  v_job_id TEXT;
  v_job_operation_id TEXT;
  v_source "inspectionSourceType";
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  -- Only mirror Inbound/Lot rows that already exist (or will exist) in legacy table.
  IF NEW."type" = 'InProcess' THEN
    RETURN NEW;
  END IF;

  PERFORM inspection_sync_enter();

  v_source := CASE WHEN NEW."type" = 'Lot' THEN 'Job'::"inspectionSourceType" ELSE 'Receipt'::"inspectionSourceType" END;

  SELECT "receiptId", "receiptLineId" INTO v_receipt_id, v_receipt_line_id
  FROM "inspectionReceipt"
  WHERE "inspectionId" = NEW."id" AND "companyId" = NEW."companyId";

  SELECT "jobId", "jobOperationId" INTO v_job_id, v_job_operation_id
  FROM "inspectionLot"
  WHERE "inspectionId" = NEW."id" AND "companyId" = NEW."companyId";

  IF EXISTS (SELECT 1 FROM "inboundInspection" WHERE "id" = NEW."id") THEN
    UPDATE "inboundInspection" SET
      "inboundInspectionId" = NEW."inspectionId",
      "sourceType" = v_source,
      "receiptId" = v_receipt_id,
      "receiptLineId" = v_receipt_line_id,
      "jobId" = v_job_id,
      "jobOperationId" = v_job_operation_id,
      "itemId" = NEW."itemId",
      "itemReadableId" = NEW."itemReadableId",
      "supplierId" = NEW."supplierId",
      "lotSize" = NEW."lotSize",
      "samplingStandard" = NEW."samplingStandard",
      "samplingPlanType" = NEW."samplingPlanType",
      "sampleSize" = NEW."sampleSize",
      "acceptanceNumber" = NEW."acceptanceNumber",
      "rejectionNumber" = NEW."rejectionNumber",
      "aql" = NEW."aql",
      "inspectionLevel" = NEW."inspectionLevel",
      "severity" = NEW."severity",
      "codeLetter" = NEW."codeLetter",
      "inspectionDocumentId" = NEW."inspectionDocumentId",
      "status" = NEW."status",
      "notes" = NEW."notes",
      "dispositionedBy" = NEW."dispositionedBy",
      "dispositionedAt" = NEW."dispositionedAt",
      "updatedBy" = NEW."updatedBy",
      "updatedAt" = NEW."updatedAt"
    WHERE "id" = NEW."id";
  ELSIF TG_OP = 'INSERT' AND (v_receipt_line_id IS NOT NULL OR v_job_id IS NOT NULL) THEN
    INSERT INTO "inboundInspection" (
      "id", "inboundInspectionId", "sourceType", "receiptId", "receiptLineId",
      "jobId", "jobOperationId", "itemId", "itemReadableId", "supplierId",
      "lotSize", "samplingStandard", "samplingPlanType", "sampleSize",
      "acceptanceNumber", "rejectionNumber", "aql", "inspectionLevel", "severity",
      "codeLetter", "inspectionDocumentId", "status", "notes",
      "dispositionedBy", "dispositionedAt", "companyId",
      "createdBy", "createdAt", "updatedBy", "updatedAt"
    ) VALUES (
      NEW."id", NEW."inspectionId", v_source, v_receipt_id, v_receipt_line_id,
      v_job_id, v_job_operation_id, NEW."itemId", NEW."itemReadableId", NEW."supplierId",
      NEW."lotSize", NEW."samplingStandard", NEW."samplingPlanType", NEW."sampleSize",
      NEW."acceptanceNumber", NEW."rejectionNumber", NEW."aql", NEW."inspectionLevel",
      NEW."severity", NEW."codeLetter", NEW."inspectionDocumentId", NEW."status", NEW."notes",
      NEW."dispositionedBy", NEW."dispositionedAt", NEW."companyId",
      NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
    );
  END IF;

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_inbound_sample_to_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "inspection" i
    WHERE i."id" = NEW."inboundInspectionId" AND i."companyId" = NEW."companyId"
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM inspection_sync_enter();

  INSERT INTO "inspectionSample" (
    "id", "companyId", "inspectionId", "trackedEntityId", "sampleIndex",
    "status", "statusOverridden", "notes", "inspectedBy", "inspectedAt",
    "createdBy", "createdAt", "updatedBy", "updatedAt"
  ) VALUES (
    NEW."id", NEW."companyId", NEW."inboundInspectionId", NEW."trackedEntityId",
    COALESCE(NEW."sampleIndex", 1), NEW."status", COALESCE(NEW."statusOverridden", false),
    NEW."notes", NEW."inspectedBy", NEW."inspectedAt",
    NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
  )
  ON CONFLICT ("id", "companyId") DO UPDATE SET
    "trackedEntityId" = EXCLUDED."trackedEntityId",
    "sampleIndex" = EXCLUDED."sampleIndex",
    "status" = EXCLUDED."status",
    "statusOverridden" = EXCLUDED."statusOverridden",
    "notes" = EXCLUDED."notes",
    "inspectedBy" = EXCLUDED."inspectedBy",
    "inspectedAt" = EXCLUDED."inspectedAt",
    "updatedBy" = EXCLUDED."updatedBy",
    "updatedAt" = EXCLUDED."updatedAt";

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_generic_sample_to_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "inboundInspection" WHERE "id" = NEW."inspectionId") THEN
    RETURN NEW;
  END IF;

  PERFORM inspection_sync_enter();

  INSERT INTO "inboundInspectionSample" (
    "id", "inboundInspectionId", "trackedEntityId", "sampleIndex",
    "status", "statusOverridden", "notes", "inspectedBy", "inspectedAt",
    "companyId", "createdBy", "createdAt", "updatedBy", "updatedAt"
  ) VALUES (
    NEW."id", NEW."inspectionId", NEW."trackedEntityId", NEW."sampleIndex",
    NEW."status", NEW."statusOverridden", NEW."notes", NEW."inspectedBy", NEW."inspectedAt",
    NEW."companyId", NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "trackedEntityId" = EXCLUDED."trackedEntityId",
    "sampleIndex" = EXCLUDED."sampleIndex",
    "status" = EXCLUDED."status",
    "statusOverridden" = EXCLUDED."statusOverridden",
    "notes" = EXCLUDED."notes",
    "inspectedBy" = EXCLUDED."inspectedBy",
    "inspectedAt" = EXCLUDED."inspectedAt",
    "updatedBy" = EXCLUDED."updatedBy",
    "updatedAt" = EXCLUDED."updatedAt";

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_inbound_measurement_to_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "inspectionSample" s
    WHERE s."id" = NEW."inboundInspectionSampleId" AND s."companyId" = NEW."companyId"
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM inspection_sync_enter();

  INSERT INTO "inspectionSampleMeasurement" (
    "id", "companyId", "inspectionSampleId", "inspectionFeatureId",
    "measuredValue", "measuredValueNumeric", "inTolerance",
    "createdBy", "createdAt", "updatedBy", "updatedAt"
  ) VALUES (
    NEW."id", NEW."companyId", NEW."inboundInspectionSampleId", NEW."inspectionFeatureId",
    NEW."measuredValue",
    CASE
      WHEN NEW."measuredValue" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN NEW."measuredValue"::NUMERIC
      ELSE NULL
    END,
    NEW."inTolerance",
    NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
  )
  ON CONFLICT ("id", "companyId") DO UPDATE SET
    "measuredValue" = EXCLUDED."measuredValue",
    "measuredValueNumeric" = EXCLUDED."measuredValueNumeric",
    "inTolerance" = EXCLUDED."inTolerance",
    "updatedBy" = EXCLUDED."updatedBy",
    "updatedAt" = EXCLUDED."updatedAt";

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_generic_measurement_to_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "inboundInspectionSample" WHERE "id" = NEW."inspectionSampleId"
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM inspection_sync_enter();

  INSERT INTO "inboundInspectionSampleMeasurement" (
    "id", "inboundInspectionSampleId", "inspectionFeatureId",
    "measuredValue", "inTolerance", "companyId",
    "createdBy", "createdAt", "updatedBy", "updatedAt"
  ) VALUES (
    NEW."id", NEW."inspectionSampleId", NEW."inspectionFeatureId",
    COALESCE(NEW."measuredValue", NEW."measuredValueNumeric"::TEXT),
    NEW."inTolerance", NEW."companyId",
    NEW."createdBy", NEW."createdAt", NEW."updatedBy", NEW."updatedAt"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "measuredValue" = EXCLUDED."measuredValue",
    "inTolerance" = EXCLUDED."inTolerance",
    "updatedBy" = EXCLUDED."updatedBy",
    "updatedAt" = EXCLUDED."updatedAt";

  PERFORM inspection_sync_exit();
  RETURN NEW;
END;
$$;

-- When subtypes land after the header, refresh the legacy mirror by
-- re-firing the inspection UPDATE sync (do not set the skip guard).
CREATE OR REPLACE FUNCTION sync_inspection_subtype_to_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF inspection_sync_guard() THEN
    RETURN NEW;
  END IF;

  UPDATE "inspection"
  SET "updatedAt" = COALESCE("updatedAt", NOW())
  WHERE "id" = NEW."inspectionId" AND "companyId" = NEW."companyId";

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_inbound_inspection_to_generic_trigger ON "inboundInspection";
CREATE TRIGGER sync_inbound_inspection_to_generic_trigger
AFTER INSERT OR UPDATE ON "inboundInspection"
FOR EACH ROW EXECUTE FUNCTION sync_inbound_inspection_to_generic();

DROP TRIGGER IF EXISTS sync_generic_inspection_to_inbound_trigger ON "inspection";
CREATE TRIGGER sync_generic_inspection_to_inbound_trigger
AFTER INSERT OR UPDATE ON "inspection"
FOR EACH ROW EXECUTE FUNCTION sync_generic_inspection_to_inbound();

DROP TRIGGER IF EXISTS sync_inspection_receipt_to_inbound_trigger ON "inspectionReceipt";
CREATE TRIGGER sync_inspection_receipt_to_inbound_trigger
AFTER INSERT OR UPDATE ON "inspectionReceipt"
FOR EACH ROW EXECUTE FUNCTION sync_inspection_subtype_to_inbound();

DROP TRIGGER IF EXISTS sync_inspection_lot_to_inbound_trigger ON "inspectionLot";
CREATE TRIGGER sync_inspection_lot_to_inbound_trigger
AFTER INSERT OR UPDATE ON "inspectionLot"
FOR EACH ROW EXECUTE FUNCTION sync_inspection_subtype_to_inbound();

DROP TRIGGER IF EXISTS sync_inbound_sample_to_generic_trigger ON "inboundInspectionSample";
CREATE TRIGGER sync_inbound_sample_to_generic_trigger
AFTER INSERT OR UPDATE ON "inboundInspectionSample"
FOR EACH ROW EXECUTE FUNCTION sync_inbound_sample_to_generic();

DROP TRIGGER IF EXISTS sync_generic_sample_to_inbound_trigger ON "inspectionSample";
CREATE TRIGGER sync_generic_sample_to_inbound_trigger
AFTER INSERT OR UPDATE ON "inspectionSample"
FOR EACH ROW EXECUTE FUNCTION sync_generic_sample_to_inbound();

DROP TRIGGER IF EXISTS sync_inbound_measurement_to_generic_trigger ON "inboundInspectionSampleMeasurement";
CREATE TRIGGER sync_inbound_measurement_to_generic_trigger
AFTER INSERT OR UPDATE ON "inboundInspectionSampleMeasurement"
FOR EACH ROW EXECUTE FUNCTION sync_inbound_measurement_to_generic();

DROP TRIGGER IF EXISTS sync_generic_measurement_to_inbound_trigger ON "inspectionSampleMeasurement";
CREATE TRIGGER sync_generic_measurement_to_inbound_trigger
AFTER INSERT OR UPDATE ON "inspectionSampleMeasurement"
FOR EACH ROW EXECUTE FUNCTION sync_generic_measurement_to_inbound();
