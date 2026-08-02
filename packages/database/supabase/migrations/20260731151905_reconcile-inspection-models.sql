-- Reconcile upstream inspection execution tables onto the fork three-type model.
--
-- Prerequisite: 20260717170708 (generic inspection), 20260722040401 (Feature /
-- Measurement on inboundInspection*), 20260722132135 (fork-guarded rename of
-- Feature→inspectionSamplingPlan / Measurement→inspectionMeasurement),
-- 20260727031247 (productionQuantity links + UNIQUE(id) on inspection*).
--
-- Scope: fork + fresh installs only. When the fork marker is absent this
-- migration is a no-op (upstream-only DBs that already renamed are out of scope).

DO $$
DECLARE
  v_fork_model boolean;
  v_conname text;
  v_ftable text;
BEGIN
  v_fork_model :=
    EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspectionType')
    AND to_regclass('public."inspectionReceipt"') IS NOT NULL;

  IF NOT v_fork_model THEN
    RETURN;
  END IF;

  -- Belt-and-suspenders: single-column FKs need UNIQUE(id) on composite-PK tables.
  CREATE UNIQUE INDEX IF NOT EXISTS "inspection_id_key" ON "inspection" ("id");
  CREATE UNIQUE INDEX IF NOT EXISTS "inspectionSample_id_key" ON "inspectionSample" ("id");

  -- Retarget inspectionSamplingPlan → inspection(id) when still on inboundInspection.
  IF to_regclass('public."inspectionSamplingPlan"') IS NOT NULL THEN
    FOR v_conname, v_ftable IN
      SELECT c.conname, conf.relname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class conf ON conf.oid = c.confrelid
      WHERE n.nspname = 'public'
        AND rel.relname = 'inspectionSamplingPlan'
        AND c.contype = 'f'
        AND conf.relname IN ('inboundInspection', 'inspection')
    LOOP
      IF v_ftable = 'inboundInspection' THEN
        EXECUTE format(
          'ALTER TABLE public."inspectionSamplingPlan" DROP CONSTRAINT %I',
          v_conname
        );
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class conf ON conf.oid = c.confrelid
      WHERE n.nspname = 'public'
        AND rel.relname = 'inspectionSamplingPlan'
        AND c.contype = 'f'
        AND conf.relname = 'inspection'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inspectionSamplingPlan'
        AND column_name = 'inspectionId'
    ) THEN
      ALTER TABLE "inspectionSamplingPlan"
        ADD CONSTRAINT "inspectionSamplingPlan_inspectionId_fkey"
        FOREIGN KEY ("inspectionId") REFERENCES "inspection"("id") ON DELETE CASCADE;
    END IF;
  END IF;

  -- Retarget inspectionMeasurement → inspection(id) + inspectionSample(id).
  IF to_regclass('public."inspectionMeasurement"') IS NOT NULL THEN
    FOR v_conname, v_ftable IN
      SELECT c.conname, conf.relname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class conf ON conf.oid = c.confrelid
      WHERE n.nspname = 'public'
        AND rel.relname = 'inspectionMeasurement'
        AND c.contype = 'f'
        AND conf.relname IN (
          'inboundInspection',
          'inboundInspectionSample',
          'inspection',
          'inspectionSample'
        )
    LOOP
      IF v_ftable IN ('inboundInspection', 'inboundInspectionSample') THEN
        EXECUTE format(
          'ALTER TABLE public."inspectionMeasurement" DROP CONSTRAINT %I',
          v_conname
        );
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class conf ON conf.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE n.nspname = 'public'
        AND rel.relname = 'inspectionMeasurement'
        AND c.contype = 'f'
        AND conf.relname = 'inspection'
        AND a.attname = 'inspectionId'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inspectionMeasurement'
        AND column_name = 'inspectionId'
    ) THEN
      ALTER TABLE "inspectionMeasurement"
        ADD CONSTRAINT "inspectionMeasurement_inspectionId_fkey"
        FOREIGN KEY ("inspectionId") REFERENCES "inspection"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class conf ON conf.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE n.nspname = 'public'
        AND rel.relname = 'inspectionMeasurement'
        AND c.contype = 'f'
        AND conf.relname = 'inspectionSample'
        AND a.attname = 'inspectionSampleId'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inspectionMeasurement'
        AND column_name = 'inspectionSampleId'
    ) THEN
      ALTER TABLE "inspectionMeasurement"
        ADD CONSTRAINT "inspectionMeasurement_inspectionSampleId_fkey"
        FOREIGN KEY ("inspectionSampleId") REFERENCES "inspectionSample"("id") ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
