-- BOM line-item effectivity (phase 3): a "valid from / valid to" date range on
-- each bill-of-materials line, so an assembly can switch a component on a date
-- (old part used on builds before the cutover, new part after). NULL = always
-- effective. MRP's BOM explosion (and, later, job creation) picks the line whose
-- range covers the build date.

ALTER TABLE "methodMaterial"
  ADD COLUMN IF NOT EXISTS "effectiveFrom" DATE,
  ADD COLUMN IF NOT EXISTS "effectiveTo" DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'methodMaterial_effective_range_check'
  ) THEN
    ALTER TABLE "methodMaterial"
      ADD CONSTRAINT "methodMaterial_effective_range_check"
        CHECK (
          "effectiveFrom" IS NULL
          OR "effectiveTo" IS NULL
          OR "effectiveTo" >= "effectiveFrom"
        );
  END IF;
END $$;
