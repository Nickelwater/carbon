-- Add sequential line reference number (01, 02, ...) to sales order lines.
ALTER TABLE "salesOrderLine"
  ADD COLUMN IF NOT EXISTS "lineNumber" INTEGER;

-- Backfill existing lines: assign 1, 2, 3... per order by createdAt, id.
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "salesOrderId"
      ORDER BY "createdAt", id
    ) AS rn
  FROM "salesOrderLine"
)
UPDATE "salesOrderLine" sol
SET "lineNumber" = numbered.rn
FROM numbered
WHERE sol.id = numbered.id
  AND sol."lineNumber" IS NULL;

-- Default for new rows: not set at DB level; application sets on insert.
COMMENT ON COLUMN "salesOrderLine"."lineNumber" IS 'Sequential line reference (1, 2, 3...) per order; displayed as 01, 02 in UI.';
