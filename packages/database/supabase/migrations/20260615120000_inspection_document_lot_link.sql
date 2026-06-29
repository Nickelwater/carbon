-- Link inspection documents to item sampling plans and lot inspections.
-- Record per-characteristic measurements when inspecting inbound/production lots.

ALTER TABLE "itemSamplingPlan"
  ADD COLUMN IF NOT EXISTS "inspectionDocumentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "itemSamplingPlan"
    ADD CONSTRAINT "itemSamplingPlan_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "itemSamplingPlan_inspectionDocumentId_idx"
  ON "itemSamplingPlan"("inspectionDocumentId");

ALTER TABLE "inboundInspection"
  ADD COLUMN IF NOT EXISTS "inspectionDocumentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "inboundInspection"
    ADD CONSTRAINT "inboundInspection_inspectionDocumentId_fkey"
      FOREIGN KEY ("inspectionDocumentId")
      REFERENCES "inspectionDocument"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "inboundInspection_inspectionDocumentId_idx"
  ON "inboundInspection"("inspectionDocumentId");

ALTER TABLE "inboundInspectionSample"
  ADD COLUMN IF NOT EXISTS "statusOverridden" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "inboundInspectionSampleMeasurement" (
  "id" TEXT NOT NULL DEFAULT id(),
  "inboundInspectionSampleId" TEXT NOT NULL,
  "inspectionFeatureId" TEXT NOT NULL,
  "measuredValue" TEXT,
  "inTolerance" BOOLEAN,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "inboundInspectionSampleMeasurement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inboundInspectionSampleMeasurement_sample_feature_unique"
    UNIQUE ("inboundInspectionSampleId", "inspectionFeatureId"),
  CONSTRAINT "inboundInspectionSampleMeasurement_sampleId_fkey"
    FOREIGN KEY ("inboundInspectionSampleId")
    REFERENCES "inboundInspectionSample"("id")
    ON DELETE CASCADE,
  CONSTRAINT "inboundInspectionSampleMeasurement_featureId_fkey"
    FOREIGN KEY ("inspectionFeatureId")
    REFERENCES "inspectionFeature"("id")
    ON DELETE CASCADE,
  CONSTRAINT "inboundInspectionSampleMeasurement_companyId_fkey"
    FOREIGN KEY ("companyId")
    REFERENCES "company"("id")
    ON DELETE CASCADE,
  CONSTRAINT "inboundInspectionSampleMeasurement_createdBy_fkey"
    FOREIGN KEY ("createdBy")
    REFERENCES "user"("id")
    ON UPDATE CASCADE,
  CONSTRAINT "inboundInspectionSampleMeasurement_updatedBy_fkey"
    FOREIGN KEY ("updatedBy")
    REFERENCES "user"("id")
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "inboundInspectionSampleMeasurement_sampleId_idx"
  ON "inboundInspectionSampleMeasurement"("inboundInspectionSampleId");

CREATE INDEX IF NOT EXISTS "inboundInspectionSampleMeasurement_featureId_idx"
  ON "inboundInspectionSampleMeasurement"("inspectionFeatureId");

ALTER TABLE "inboundInspectionSampleMeasurement" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SELECT" ON "inboundInspectionSampleMeasurement";
CREATE POLICY "SELECT" ON "inboundInspectionSampleMeasurement"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_view'))::text[]
  )
);

DROP POLICY IF EXISTS "INSERT" ON "inboundInspectionSampleMeasurement";
CREATE POLICY "INSERT" ON "inboundInspectionSampleMeasurement"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_create'))::text[]
  )
);

DROP POLICY IF EXISTS "UPDATE" ON "inboundInspectionSampleMeasurement";
CREATE POLICY "UPDATE" ON "inboundInspectionSampleMeasurement"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_update'))::text[]
  )
);

DROP POLICY IF EXISTS "DELETE" ON "inboundInspectionSampleMeasurement";
CREATE POLICY "DELETE" ON "inboundInspectionSampleMeasurement"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('quality_delete'))::text[]
  )
);
