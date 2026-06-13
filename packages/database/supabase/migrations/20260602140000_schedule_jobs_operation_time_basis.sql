-- Expose partsPerCycle and timeBasis on date-schedule job RPCs (from root make method ops)

DROP FUNCTION IF EXISTS get_jobs_by_date_range;
CREATE OR REPLACE FUNCTION get_jobs_by_date_range(
  location_id TEXT,
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  "id" TEXT,
  "jobId" TEXT,
  "status" "jobStatus",
  "dueDate" DATE,
  "completedDate" TIMESTAMP WITH TIME ZONE,
  "deadlineType" "deadlineType",
  "customerId" TEXT,
  "customerName" TEXT,
  "salesOrderReadableId" TEXT,
  "salesOrderId" TEXT,
  "salesOrderLineId" TEXT,
  "itemId" TEXT,
  "itemReadableId" TEXT,
  "itemDescription" TEXT,
  "quantity" NUMERIC,
  "quantityComplete" NUMERIC,
  "quantityShipped" NUMERIC,
  "priority" DOUBLE PRECISION,
  "assignee" TEXT,
  "tags" TEXT[],
  "thumbnailPath" TEXT,
  "operationCount" INTEGER,
  "completedOperationCount" INTEGER,
  "hasConflict" BOOLEAN,
  "jobMakeMethodId" TEXT,
  "partsPerCycle" NUMERIC,
  "timeBasis" "operationTimeBasis"
)
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT
      j."id",
      j."jobId",
      j."status",
      j."dueDate",
      j."completedDate",
      j."deadlineType",
      j."customerId",
      j."salesOrderLineId",
      j."quantity",
      j."quantityShipped",
      j."priority",
      j."assignee",
      j."tags",
      mu."thumbnailPath"
    FROM "job" j
    LEFT JOIN "modelUpload" mu ON mu.id = j."modelUploadId"
    WHERE j."locationId" = location_id
    AND j."dueDate" IS NOT NULL
    AND j."dueDate" >= start_date
    AND j."dueDate" <= end_date
    AND j."status" != 'Cancelled'
  ),
  job_items AS (
    SELECT DISTINCT ON (jmm."jobId")
      jmm."jobId",
      jmm."id" AS "jobMakeMethodId",
      jmm."itemId",
      i."readableId" AS "itemReadableId",
      i."name" AS "itemDescription",
      i."thumbnailPath" AS "itemThumbnailPath",
      imu."thumbnailPath" AS "itemModelThumbnailPath"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON i.id = jmm."itemId"
    LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
    WHERE jmm."parentMaterialId" IS NULL
    ORDER BY jmm."jobId", jmm."createdAt"
  ),
  operation_stats AS (
    SELECT
      jo."jobId",
      COUNT(*)::INTEGER AS "operationCount",
      COUNT(*) FILTER (WHERE jo."status" = 'Done')::INTEGER AS "completedOperationCount",
      BOOL_OR(COALESCE(jo."hasConflict", FALSE)) AS "hasConflict"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    GROUP BY jo."jobId"
  ),
  parent_quantity_complete AS (
    SELECT
      jo."jobId",
      MAX(jo."quantityComplete") AS "quantityComplete"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    GROUP BY jo."jobId"
  ),
  parent_op_timing AS (
    SELECT DISTINCT ON (jo."jobId")
      jo."jobId",
      jo."partsPerCycle",
      jo."timeBasis"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    ORDER BY
      jo."jobId",
      CASE WHEN jo."timeBasis" = 'Cycle' THEN 0 ELSE 1 END,
      jo."order" DESC
  )
  SELECT
    rj."id",
    rj."jobId",
    rj."status",
    rj."dueDate",
    rj."completedDate",
    rj."deadlineType",
    rj."customerId",
    c."name" AS "customerName",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    rj."salesOrderLineId",
    ji."itemId",
    ji."itemReadableId",
    ji."itemDescription",
    rj."quantity",
    COALESCE(pqc."quantityComplete", 0) AS "quantityComplete",
    rj."quantityShipped",
    rj."priority",
    rj."assignee",
    rj."tags",
    COALESCE(ji."itemThumbnailPath", ji."itemModelThumbnailPath", rj."thumbnailPath") AS "thumbnailPath",
    COALESCE(os."operationCount", 0) AS "operationCount",
    COALESCE(os."completedOperationCount", 0) AS "completedOperationCount",
    COALESCE(os."hasConflict", FALSE) AS "hasConflict",
    ji."jobMakeMethodId",
    pot."partsPerCycle",
    pot."timeBasis"
  FROM relevant_jobs rj
  LEFT JOIN "salesOrderLine" sol ON sol."id" = rj."salesOrderLineId"
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId"
  LEFT JOIN "customer" c ON c."id" = rj."customerId"
  LEFT JOIN job_items ji ON ji."jobId" = rj."id"
  LEFT JOIN operation_stats os ON os."jobId" = rj."id"
  LEFT JOIN parent_quantity_complete pqc ON pqc."jobId" = rj."id"
  LEFT JOIN parent_op_timing pot ON pot."jobId" = rj."id"
  ORDER BY rj."dueDate";
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_unscheduled_jobs;
CREATE OR REPLACE FUNCTION get_unscheduled_jobs(
  location_id TEXT
)
RETURNS TABLE (
  "id" TEXT,
  "jobId" TEXT,
  "status" "jobStatus",
  "dueDate" DATE,
  "completedDate" TIMESTAMP WITH TIME ZONE,
  "deadlineType" "deadlineType",
  "customerId" TEXT,
  "customerName" TEXT,
  "salesOrderReadableId" TEXT,
  "salesOrderId" TEXT,
  "salesOrderLineId" TEXT,
  "itemId" TEXT,
  "itemReadableId" TEXT,
  "itemDescription" TEXT,
  "quantity" NUMERIC,
  "quantityComplete" NUMERIC,
  "quantityShipped" NUMERIC,
  "priority" DOUBLE PRECISION,
  "assignee" TEXT,
  "tags" TEXT[],
  "thumbnailPath" TEXT,
  "operationCount" INTEGER,
  "completedOperationCount" INTEGER,
  "hasConflict" BOOLEAN,
  "jobMakeMethodId" TEXT,
  "partsPerCycle" NUMERIC,
  "timeBasis" "operationTimeBasis"
)
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT
      j."id",
      j."jobId",
      j."status",
      j."dueDate",
      j."completedDate",
      j."deadlineType",
      j."customerId",
      j."salesOrderLineId",
      j."quantity",
      j."quantityShipped",
      j."priority",
      j."assignee",
      j."tags",
      mu."thumbnailPath"
    FROM "job" j
    LEFT JOIN "modelUpload" mu ON mu.id = j."modelUploadId"
    WHERE j."locationId" = location_id
    AND j."dueDate" IS NULL
    AND j."status" NOT IN ('Cancelled', 'Draft', 'Planned', 'Completed')
  ),
  job_items AS (
    SELECT DISTINCT ON (jmm."jobId")
      jmm."jobId",
      jmm."id" AS "jobMakeMethodId",
      jmm."itemId",
      i."readableId" AS "itemReadableId",
      i."name" AS "itemDescription",
      i."thumbnailPath" AS "itemThumbnailPath",
      imu."thumbnailPath" AS "itemModelThumbnailPath"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON i.id = jmm."itemId"
    LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId"
    WHERE jmm."parentMaterialId" IS NULL
    ORDER BY jmm."jobId", jmm."createdAt"
  ),
  operation_stats AS (
    SELECT
      jo."jobId",
      COUNT(*)::INTEGER AS "operationCount",
      COUNT(*) FILTER (WHERE jo."status" = 'Done')::INTEGER AS "completedOperationCount",
      BOOL_OR(COALESCE(jo."hasConflict", FALSE)) AS "hasConflict"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    GROUP BY jo."jobId"
  ),
  parent_quantity_complete AS (
    SELECT
      jo."jobId",
      MAX(jo."quantityComplete") AS "quantityComplete"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    GROUP BY jo."jobId"
  ),
  parent_op_timing AS (
    SELECT DISTINCT ON (jo."jobId")
      jo."jobId",
      jo."partsPerCycle",
      jo."timeBasis"
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
    ORDER BY
      jo."jobId",
      CASE WHEN jo."timeBasis" = 'Cycle' THEN 0 ELSE 1 END,
      jo."order" DESC
  )
  SELECT
    rj."id",
    rj."jobId",
    rj."status",
    rj."dueDate",
    rj."completedDate",
    rj."deadlineType",
    rj."customerId",
    c."name" AS "customerName",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    rj."salesOrderLineId",
    ji."itemId",
    ji."itemReadableId",
    ji."itemDescription",
    rj."quantity",
    COALESCE(pqc."quantityComplete", 0) AS "quantityComplete",
    rj."quantityShipped",
    rj."priority",
    rj."assignee",
    rj."tags",
    COALESCE(ji."itemThumbnailPath", ji."itemModelThumbnailPath", rj."thumbnailPath") AS "thumbnailPath",
    COALESCE(os."operationCount", 0) AS "operationCount",
    COALESCE(os."completedOperationCount", 0) AS "completedOperationCount",
    COALESCE(os."hasConflict", FALSE) AS "hasConflict",
    ji."jobMakeMethodId",
    pot."partsPerCycle",
    pot."timeBasis"
  FROM relevant_jobs rj
  LEFT JOIN "salesOrderLine" sol ON sol."id" = rj."salesOrderLineId"
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId"
  LEFT JOIN "customer" c ON c."id" = rj."customerId"
  LEFT JOIN job_items ji ON ji."jobId" = rj."id"
  LEFT JOIN operation_stats os ON os."jobId" = rj."id"
  LEFT JOIN parent_quantity_complete pqc ON pqc."jobId" = rj."id"
  LEFT JOIN parent_op_timing pot ON pot."jobId" = rj."id"
  ORDER BY rj."priority" DESC;
END;
$$ LANGUAGE plpgsql;
