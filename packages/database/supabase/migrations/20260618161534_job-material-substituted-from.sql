-- Traceability for the job-creation supersession swap: when a job's method is
-- instantiated and a component is replaced by its successor (effective phase-out),
-- record what it replaced and the conversion factor used, so the job material can
-- show "↩ substituted from <old part>" and the swap is auditable.
-- substitutedFromItemId is a PLAIN reference (deliberately NO foreign key to
-- "item"): a second jobMaterial -> item FK would make every jobMaterial->item
-- PostgREST embed (e.g. item(replenishmentSystem)) ambiguous and break it. The
-- old part's readable id is resolved from the items store, not via an embed, so
-- no FK is needed.
ALTER TABLE "jobMaterial"
  ADD COLUMN IF NOT EXISTS "substitutedFromItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "substitutionFactor" NUMERIC;

-- Defensive: drop the FK if an earlier version of this migration added it.
ALTER TABLE "jobMaterial"
  DROP CONSTRAINT IF EXISTS "jobMaterial_substitutedFromItemId_fkey";
