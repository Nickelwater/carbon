-- Batch lots use one tracked entity for many units. Allow multiple sample rows
-- per (inspection, entity) and drop the global one-sample-per-entity constraint.

ALTER TABLE "inboundInspectionSample"
  DROP CONSTRAINT IF EXISTS "inboundInspectionSample_trackedEntityId_unique";

ALTER TABLE "inboundInspectionSample"
  ADD COLUMN IF NOT EXISTS "sampleIndex" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "inboundInspectionSample_lot_entity_idx"
  ON "inboundInspectionSample"("inboundInspectionId", "trackedEntityId", "sampleIndex");
