-- Parts per cycle: how many parts are produced per machine cycle.
-- Renames quote cavityMultiplier when present; adds column to method and job operations.

ALTER TABLE "quoteOperation"
  ADD COLUMN IF NOT EXISTS "partsPerCycle" NUMERIC(10,4) NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quoteOperation'
      AND column_name = 'cavityMultiplier'
  ) THEN
    UPDATE "quoteOperation"
    SET "partsPerCycle" = COALESCE("cavityMultiplier", 1)
  WHERE "cavityMultiplier" IS DISTINCT FROM "partsPerCycle";

    ALTER TABLE "quoteOperation" DROP COLUMN "cavityMultiplier";
  END IF;
END $$;

ALTER TABLE "methodOperation"
  ADD COLUMN IF NOT EXISTS "partsPerCycle" NUMERIC(10,4) NOT NULL DEFAULT 1;

ALTER TABLE "jobOperation"
  ADD COLUMN IF NOT EXISTS "partsPerCycle" NUMERIC(10,4) NOT NULL DEFAULT 1;

-- Expose partsPerCycle on MES job operation detail
DROP FUNCTION IF EXISTS get_job_operation_by_id(TEXT);
CREATE OR REPLACE FUNCTION get_job_operation_by_id(operation_id TEXT)
RETURNS TABLE (
  id TEXT,
  "jobId" TEXT,
  "jobMakeMethodId" TEXT,
  "operationOrder" DOUBLE PRECISION,
  "processId" TEXT,
  "workCenterId" TEXT,
  description TEXT,
  "setupTime" NUMERIC,
  "setupUnit" factor,
  "laborTime" NUMERIC,
  "laborUnit" factor,
  "machineTime" NUMERIC,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" TEXT,
  "jobStatus" "jobStatus",
  "jobDueDate" DATE,
  "jobDeadlineType" "deadlineType",
  "parentMaterialId" TEXT,
  "itemId" TEXT,
  "itemReadableId" TEXT,
  "itemDescription" TEXT,
  "itemUnitOfMeasure" TEXT,
  "itemModelPath" TEXT,
  "itemModelId" TEXT,
  "itemModelName" TEXT,
  "itemModelSize" BIGINT,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" NUMERIC,
  "operationQuantity" NUMERIC,
  "quantityComplete" NUMERIC,
  "quantityReworked" NUMERIC,
  "quantityScrapped" NUMERIC,
  "workInstruction" JSON,
  "operationDueDate" DATE,
  "reworkId" TEXT,
  "partsPerCycle" NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    jo."id",
    jo."jobId",
    jo."jobMakeMethodId",
    jo."order" AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    j."jobId" AS "jobReadableId",
    j."status" AS "jobStatus",
    j."dueDate"::DATE AS "jobDueDate",
    j."deadlineType" AS "jobDeadlineType",
    jmm."parentMaterialId",
    i."id" as "itemId",
    i."readableIdWithRevision" as "itemReadableId",
    i."name" as "itemDescription",
    uom."name" as "itemUnitOfMeasure",
    m."modelPath" as "itemModelPath",
    m."id" as "itemModelId",
    m."name" as "itemModelName",
    m."size" as "itemModelSize",
    jo."status" AS "operationStatus",
    jo."targetQuantity"::NUMERIC,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityReworked",
    jo."quantityScrapped",
    jo."workInstruction",
    jo."dueDate" AS "operationDueDate",
    jo."reworkId",
    jo."partsPerCycle"
  FROM "jobOperation" jo
  JOIN "job" j ON j.id = jo."jobId"
  LEFT JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
  LEFT JOIN "item" i ON jmm."itemId" = i.id
  LEFT JOIN "unitOfMeasure" uom ON i."unitOfMeasureCode" = uom."code" AND i."companyId" = uom."companyId"
  LEFT JOIN "modelUpload" m ON i."modelUploadId" = m.id
  WHERE jo.id = operation_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
