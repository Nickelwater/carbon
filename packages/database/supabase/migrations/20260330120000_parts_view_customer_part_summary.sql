DROP VIEW IF EXISTS "parts";
CREATE OR REPLACE VIEW "parts" WITH (SECURITY_INVOKER=true) AS
WITH latest_items AS (
  SELECT DISTINCT ON (i."readableId", i."companyId")
    i.*,
    mu.id AS "modelUploadId",

    mu."modelPath",
    mu."thumbnailPath" AS "modelThumbnailPath",
    mu."name" AS "modelName",
    mu."size" AS "modelSize"
  FROM "item" i
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  ORDER BY i."readableId", i."companyId", i."createdAt" DESC NULLS LAST
),
item_revisions AS (
  SELECT
    i."readableId",
    i."companyId",
    json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'name', i."name",
        'description', i."description",
        'active', i."active",
        'createdAt', i."createdAt"
      ) ORDER BY i."createdAt"
    ) AS "revisions"
  FROM "item" i
  GROUP BY i."readableId", i."companyId"
)
SELECT
  li."active",
  li."assignee",
  li."defaultMethodType",
  li."description",
  li."itemTrackingType",
  li."name",
  li."replenishmentSystem",
  li."unitOfMeasureCode",
  li."notes",
  li."revision",
  li."readableId",
  li."readableIdWithRevision",
  li."id",
  li."companyId",
  CASE
    WHEN li."thumbnailPath" IS NULL AND li."modelThumbnailPath" IS NOT NULL THEN li."modelThumbnailPath"
    ELSE li."thumbnailPath"
  END AS "thumbnailPath",

  li."modelPath",
  li."modelName",
  li."modelSize",
  ps."supplierIds",
  cpts."customerPartSummary",
  uom.name AS "unitOfMeasure",
  ir."revisions",
  p."customFields",
  p."tags",
  ic."itemPostingGroupId",
  (
    SELECT COALESCE(
      jsonb_object_agg(
        eim."integration",
        CASE
          WHEN eim."metadata" IS NOT NULL THEN eim."metadata"
          ELSE to_jsonb(eim."externalId")
        END
      ) FILTER (WHERE eim."externalId" IS NOT NULL OR eim."metadata" IS NOT NULL),
      '{}'::jsonb
    )
    FROM "externalIntegrationMapping" eim
    WHERE eim."entityType" = 'item' AND eim."entityId" = li.id
  ) AS "externalId",
  li."createdBy",
  li."createdAt",
  li."updatedBy",
  li."updatedAt"
FROM "part" p
INNER JOIN latest_items li ON li."readableId" = p."id" AND li."companyId" = p."companyId"
LEFT JOIN item_revisions ir ON ir."readableId" = p."id" AND ir."companyId" = p."companyId"
LEFT JOIN (
  SELECT
    "itemId",
    "companyId",
    string_agg(ps."supplierPartId", ',') AS "supplierIds"
  FROM "supplierPart" ps
  GROUP BY "itemId", "companyId"
) ps ON ps."itemId" = li."id" AND ps."companyId" = li."companyId"
LEFT JOIN (
  SELECT
    cpti."itemId",
    cpti."companyId",
    CASE
      WHEN COUNT(*) = 1 THEN MAX(
        cpti."customerPartId" || CASE
          WHEN cpti."customerPartRevision" IS NOT NULL AND btrim(cpti."customerPartRevision") <> '' THEN ' (' || cpti."customerPartRevision" || ')'
          ELSE ''
        END
      )
      ELSE string_agg(
        c."name" || ': ' || cpti."customerPartId" || CASE
          WHEN cpti."customerPartRevision" IS NOT NULL AND btrim(cpti."customerPartRevision") <> '' THEN ' (' || cpti."customerPartRevision" || ')'
          ELSE ''
        END,
        ' · ' ORDER BY c."name", cpti."customerPartId"
      )
    END AS "customerPartSummary"
  FROM "customerPartToItem" cpti
  INNER JOIN "customer" c ON c.id = cpti."customerId" AND c."companyId" = cpti."companyId"
  GROUP BY cpti."itemId", cpti."companyId"
) cpts ON cpts."itemId" = li."id" AND cpts."companyId" = li."companyId"
LEFT JOIN "unitOfMeasure" uom ON uom.code = li."unitOfMeasureCode" AND uom."companyId" = li."companyId"
LEFT JOIN "itemCost" ic ON ic."itemId" = li.id;
