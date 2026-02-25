-- Recreate quoteLines view so it includes the lineNumber column added to quoteLine.
DROP VIEW IF EXISTS "quoteLinePrices";
DROP VIEW IF EXISTS "quoteLines";

CREATE OR REPLACE VIEW "quoteLines" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    ql.*,
    COALESCE(i."readableIdWithRevision", qp."name") AS "itemReadableId",
    CASE
      WHEN i.id IS NOT NULL THEN
        CASE
          WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
          WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
          ELSE i."thumbnailPath"
        END
      WHEN qp.id IS NOT NULL THEN
        CASE
          WHEN qp."modelUploadId" IS NOT NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
          ELSE NULL
        END
      ELSE NULL
    END AS "thumbnailPath",
    COALESCE(mu.id, imu.id) AS "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") AS "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") AS "modelPath",
    COALESCE(mu."name", imu."name") AS "modelName",
    COALESCE(mu."size", imu."size") AS "modelSize",
    ic."unitCost" AS "unitCost"
  FROM "quoteLine" ql
  LEFT JOIN "item" i ON i.id = ql."itemId"
  LEFT JOIN "quotePart" qp ON qp.id = ql."quotePartId"
  LEFT JOIN "modelUpload" mu ON ql."modelUploadId" = mu."id"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON (i."modelUploadId" = imu.id OR qp."modelUploadId" = imu.id)
);

-- quoteLinePrices also selects ql.* so recreate it to include lineNumber
CREATE OR REPLACE VIEW "quoteLinePrices" WITH(SECURITY_INVOKER=true) AS (
  SELECT
    ql.*,
    COALESCE(i."readableIdWithRevision", qp."name") AS "itemReadableId",
    CASE
      WHEN i.id IS NOT NULL THEN
        CASE
          WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
          WHEN i."thumbnailPath" IS NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
          ELSE i."thumbnailPath"
        END
      WHEN qp.id IS NOT NULL THEN
        CASE
          WHEN qp."modelUploadId" IS NOT NULL AND imu."thumbnailPath" IS NOT NULL THEN imu."thumbnailPath"
          ELSE NULL
        END
      ELSE NULL
    END AS "thumbnailPath",
    COALESCE(mu.id, imu.id) AS "modelId",
    COALESCE(mu."autodeskUrn", imu."autodeskUrn") AS "autodeskUrn",
    COALESCE(mu."modelPath", imu."modelPath") AS "modelPath",
    COALESCE(mu."name", imu."name") AS "modelName",
    COALESCE(mu."size", imu."size") AS "modelSize",
    ic."unitCost" AS "unitCost",
    qlp."quantity" AS "qty",
    qlp."unitPrice",
    CASE
      WHEN q."revisionId" > 0 THEN q."quoteId" || '-' || q."revisionId"::text
      ELSE q."quoteId"
    END AS "quoteReadableId",
    q."createdAt" AS "quoteCreatedAt",
    q."customerId"
  FROM "quoteLine" ql
  INNER JOIN "quote" q ON q.id = ql."quoteId"
  LEFT JOIN "item" i ON i.id = ql."itemId"
  LEFT JOIN "quotePart" qp ON qp.id = ql."quotePartId"
  LEFT JOIN "modelUpload" mu ON ql."modelUploadId" = mu."id"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id
  LEFT JOIN "modelUpload" imu ON (i."modelUploadId" = imu.id OR qp."modelUploadId" = imu.id)
  LEFT JOIN "quoteLinePrice" qlp ON qlp."quoteLineId" = ql.id
);
