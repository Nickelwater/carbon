-- Cavity multiplier: processes that produce multiple parts per cycle.
-- When > 1, labor and machine time per piece are effectively divided by this for costing
-- (e.g. 60 sec/piece with cavity 4 = 15 sec per piece effective).
ALTER TABLE "quoteOperation"
  ADD COLUMN IF NOT EXISTS "cavityMultiplier" NUMERIC(10,4) NOT NULL DEFAULT 1;
