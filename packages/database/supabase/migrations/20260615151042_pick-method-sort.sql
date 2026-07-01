-- Per-item, per-location tracked-entity pick order. Drives the default
-- selection of the FEFO/FIFO/LIFO/Default dropdown in TrackedEntityPicker
-- when picking serial/batch material. 'Default' = the picker's smart order
-- (expiring soonest first, then oldest created).
DO $$ BEGIN
  CREATE TYPE "pickMethodSortMethod" AS ENUM ('Default', 'FEFO', 'FIFO', 'LIFO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "pickMethod"
  ADD COLUMN IF NOT EXISTS "sortMethod" "pickMethodSortMethod" NOT NULL DEFAULT 'Default';
