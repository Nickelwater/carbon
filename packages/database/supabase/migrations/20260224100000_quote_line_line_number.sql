-- Add sequential line reference number (01, 02, ...) to quote lines.
ALTER TABLE "quoteLine"
  ADD COLUMN IF NOT EXISTS "lineNumber" INTEGER;

-- Backfill existing lines: assign 1, 2, 3... per quote by id.
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "quoteId"
      ORDER BY id
    ) AS rn
  FROM "quoteLine"
)
UPDATE "quoteLine" ql
SET "lineNumber" = numbered.rn
FROM numbered
WHERE ql.id = numbered.id
  AND ql."lineNumber" IS NULL;

COMMENT ON COLUMN "quoteLine"."lineNumber" IS 'Sequential line reference (1, 2, 3...) per quote; displayed as 01, 02 in UI.';
