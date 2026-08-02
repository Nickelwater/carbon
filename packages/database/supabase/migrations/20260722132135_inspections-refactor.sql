-- Inspections refactor: generalize the inbound inspection family to a
-- source-document model and rename the tables to the `inspection` family.
-- Spec: .ai/specs/2026-07-21-inbound-inspection-execution.md (2026-07-22 entry)
--
-- Naming constraints: `inspectionFeature` (document characteristics) and the
-- Pass/Fail enum `inspectionStatus` already exist, so the per-lot plan table
-- becomes `inspectionSamplingPlan` and the status enums take the *StatusType
-- suffix (supplierStatusType precedent). Old constraint/index NAMES keep their
-- `inboundInspection` strings — renaming them is cosmetic churn.
--
-- Fork guard (Nickelwater three-type model): when `inspectionType` +
-- `inspectionReceipt` already exist from 20260717170708, skip colliding
-- renames / enum renames / sourceDocument required model / sequence re-key.
-- Still absorb Feature→inspectionSamplingPlan and Measurement→inspectionMeasurement
-- when those targets are free. See FORK.md and 20260731*_reconcile-inspection-models.

-- 1) Table renames (RLS policies follow the table)
DO $$
DECLARE
  v_fork_model boolean;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  -- Colliding renames: only when the fork generic model is absent.
  IF NOT v_fork_model THEN
    IF to_regclass('public."inboundInspection"') IS NOT NULL
       AND to_regclass('public."inspection"') IS NULL THEN
      ALTER TABLE "inboundInspection" RENAME TO "inspection";
    END IF;
    IF to_regclass('public."inboundInspectionSample"') IS NOT NULL
       AND to_regclass('public."inspectionSample"') IS NULL THEN
      ALTER TABLE "inboundInspectionSample" RENAME TO "inspectionSample";
    END IF;
    IF to_regclass('public."inboundInspectionHistory"') IS NOT NULL
       AND to_regclass('public."inspectionHistory"') IS NULL THEN
      ALTER TABLE "inboundInspectionHistory" RENAME TO "inspectionHistory";
    END IF;
    IF to_regclass('public."nonConformanceInboundInspection"') IS NOT NULL
       AND to_regclass('public."nonConformanceInspection"') IS NULL THEN
      ALTER TABLE "nonConformanceInboundInspection" RENAME TO "nonConformanceInspection";
    END IF;
  END IF;

  -- Additive upstream execution tables: rename when target is free (fork + upstream).
  IF to_regclass('public."inboundInspectionFeature"') IS NOT NULL
     AND to_regclass('public."inspectionSamplingPlan"') IS NULL THEN
    ALTER TABLE "inboundInspectionFeature" RENAME TO "inspectionSamplingPlan";
  END IF;
  IF to_regclass('public."inboundInspectionMeasurement"') IS NOT NULL
     AND to_regclass('public."inspectionMeasurement"') IS NULL THEN
    ALTER TABLE "inboundInspectionMeasurement" RENAME TO "inspectionMeasurement";
  END IF;
END $$;

-- 2) Enum renames (skip on fork — app + dual-write still use inboundInspection* names)
DO $$
DECLARE
  v_fork_model boolean;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  IF v_fork_model THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inboundInspectionStatus')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionStatusType') THEN
    ALTER TYPE "inboundInspectionStatus" RENAME TO "inspectionStatusType";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inboundInspectionSampleStatus')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionSampleStatusType') THEN
    ALTER TYPE "inboundInspectionSampleStatus" RENAME TO "inspectionSampleStatusType";
  END IF;
END $$;

-- 3) Column renames. Parent readable id follows the nonConformance precedent
-- (readable `inspectionId` on the parent; child FK columns share the name but
-- reference inspection.id).
-- On the fork path, only rename columns on SamplingPlan / Measurement (the
-- colliding header/sample/history/NCR tables were not renamed).
DO $$
DECLARE
  v_fork_model boolean;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  IF NOT v_fork_model THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'inspection'
                 AND column_name = 'inboundInspectionId') THEN
      ALTER TABLE "inspection" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'inspectionSample'
                 AND column_name = 'inboundInspectionId') THEN
      ALTER TABLE "inspectionSample" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'inspectionHistory'
                 AND column_name = 'inboundInspectionId') THEN
      ALTER TABLE "inspectionHistory" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'nonConformanceInspection'
                 AND column_name = 'inboundInspectionId') THEN
      ALTER TABLE "nonConformanceInspection" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'inspectionSamplingPlan'
               AND column_name = 'inboundInspectionId') THEN
    ALTER TABLE "inspectionSamplingPlan" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'inspectionMeasurement'
               AND column_name = 'inboundInspectionId') THEN
    ALTER TABLE "inspectionMeasurement" RENAME COLUMN "inboundInspectionId" TO "inspectionId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'inspectionMeasurement'
               AND column_name = 'inboundInspectionSampleId') THEN
    ALTER TABLE "inspectionMeasurement" RENAME COLUMN "inboundInspectionSampleId" TO "inspectionSampleId";
  END IF;
END $$;

-- 4) Generic source-document model (upstream-only path)
DO $$
DECLARE
  v_fork_model boolean;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  IF v_fork_model THEN
    RETURN;
  END IF;

  BEGIN
    CREATE TYPE "inspectionSourceDocument" AS ENUM ('Receipt', 'Job Operation');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  ALTER TABLE "inspection"
    ADD COLUMN IF NOT EXISTS "sourceDocument" "inspectionSourceDocument",
    ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceDocumentLineId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceDocumentReadableId" TEXT;

  -- Backfill from the receipt-specific columns, then drop them. Gated on the old
  -- columns still existing so a retry over committed partial state is a no-op.
  -- Dropping the columns also drops their FK and unique constraints.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'inspection'
               AND column_name = 'receiptLineId') THEN
    UPDATE "inspection" i
    SET
      "sourceDocument" = 'Receipt',
      "sourceDocumentId" = i."receiptId",
      "sourceDocumentLineId" = i."receiptLineId",
      "sourceDocumentReadableId" = r."receiptId"
    FROM "receipt" r
    WHERE r."id" = i."receiptId"
      AND i."sourceDocument" IS NULL;

    -- Safety net for rows whose receipt no longer resolves (should not exist;
    -- the FK was ON DELETE CASCADE).
    UPDATE "inspection"
    SET
      "sourceDocument" = 'Receipt',
      "sourceDocumentId" = "receiptId",
      "sourceDocumentLineId" = "receiptLineId"
    WHERE "sourceDocument" IS NULL;

    ALTER TABLE "inspection" DROP COLUMN "receiptId";
    ALTER TABLE "inspection" DROP COLUMN "receiptLineId";
  END IF;

  ALTER TABLE "inspection"
    ALTER COLUMN "sourceDocument" SET NOT NULL,
    ALTER COLUMN "sourceDocumentId" SET NOT NULL;

  -- One inspection per source line (was: unique receiptLineId). No FKs on the
  -- generic ids — same as receipt."sourceDocumentId".
  CREATE UNIQUE INDEX IF NOT EXISTS "inspection_sourceDocumentLineId_key"
    ON "inspection" ("sourceDocument", "sourceDocumentLineId")
    WHERE "sourceDocumentLineId" IS NOT NULL;
  CREATE INDEX IF NOT EXISTS "inspection_sourceDocumentId_idx"
    ON "inspection" ("sourceDocumentId");
  CREATE INDEX IF NOT EXISTS "inspection_sourceDocument_idx"
    ON "inspection" ("sourceDocument");
END $$;

-- 5) Sequence re-key (upstream-only; fork keeps inboundInspection / lotInspection /
-- inProcessInspection sequences)
DO $$
DECLARE
  v_fork_model boolean;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  IF v_fork_model THEN
    RETURN;
  END IF;

  -- Existing companies keep their prefix (II) and counter;
  -- only NEW companies seed the INS prefix (lib/seed.data.ts).
  UPDATE "sequence"
  SET "table" = 'inspection', "name" = 'Inspection'
  WHERE "table" = 'inboundInspection';
END $$;
