-- Restore get_quote_methods / get_quote_methods_by_method_id for quote-only parts.
-- 20260321143847_method-type-migration.sql used INNER JOIN "item", excluding roots with
-- quotePartId only, which broke method trees, unit cost rollup, and markup pricing.
-- Uses storageUnitId (not shelfId) per 20260417000100_storage-unit-rename.sql.

DROP FUNCTION IF EXISTS get_quote_methods_by_method_id(TEXT);
DROP FUNCTION IF EXISTS get_quote_methods(TEXT);

CREATE OR REPLACE FUNCTION get_quote_methods(qid TEXT)
RETURNS TABLE (
    "quoteId" TEXT,
    "quoteLineId" TEXT,
    "methodMaterialId" TEXT,
    "quoteMakeMethodId" TEXT,
    "quoteMaterialMakeMethodId" TEXT,
    "itemId" TEXT,
    "itemReadableId" TEXT,
    "description" TEXT,
    "itemType" TEXT,
    "quantity" NUMERIC,
    "unitCost" NUMERIC,
    "methodType" "methodType",
    "parentMaterialId" TEXT,
    "order" DOUBLE PRECISION,
    "isRoot" BOOLEAN,
    "kit" BOOLEAN,
    "revision" TEXT,
    "externalId" JSONB,
    "version" NUMERIC(10,2),
    "storageUnitId" TEXT
) AS $$
WITH RECURSIVE material AS (
    SELECT
        qmm."quoteId",
        qmm."quoteLineId",
        qmm."id",
        qmm."id" AS "quoteMakeMethodId",
        'Make to Order'::"methodType" AS "methodType",
        qmm."id" AS "quoteMaterialMakeMethodId",
        qmm."itemId",
        qmm."quotePartId",
        'Part' AS "itemType",
        1::NUMERIC AS "quantity",
        0::NUMERIC AS "unitCost",
        qmm."parentMaterialId",
        CAST(1 AS DOUBLE PRECISION) AS "order",
        TRUE AS "isRoot",
        FALSE AS "kit",
        qmm."version",
        NULL::TEXT AS "storageUnitId"
    FROM
        "quoteMakeMethod" qmm
    WHERE
        qmm."quoteId" = qid
        AND qmm."parentMaterialId" IS NULL
    UNION
    SELECT
        child."quoteId",
        child."quoteLineId",
        child."id",
        child."quoteMakeMethodId",
        child."methodType",
        child."quoteMaterialMakeMethodId",
        child."itemId",
        NULL::TEXT AS "quotePartId",
        child."itemType",
        child."quantity",
        child."unitCost",
        parent."id" AS "parentMaterialId",
        child."order",
        FALSE AS "isRoot",
        child."kit",
        child."version",
        child."storageUnitId"
    FROM
        "quoteMaterialWithMakeMethodId" child
        INNER JOIN material parent ON parent."quoteMaterialMakeMethodId" = child."quoteMakeMethodId"
)
SELECT
  material."quoteId",
  material."quoteLineId",
  material.id AS "methodMaterialId",
  material."quoteMakeMethodId",
  material."quoteMaterialMakeMethodId",
  material."itemId",
  COALESCE(item."readableIdWithRevision", qp."name") AS "itemReadableId",
  COALESCE(item."name", qp."name") AS "description",
  material."itemType",
  material."quantity",
  material."unitCost",
  material."methodType",
  material."parentMaterialId",
  material."order",
  material."isRoot",
  material."kit",
  item."revision",
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
    WHERE eim."entityType" = 'item' AND eim."entityId" = material."itemId"
  ) AS "externalId",
  material."version",
  material."storageUnitId"
FROM material
LEFT JOIN item ON material."itemId" = item.id
LEFT JOIN "quotePart" qp ON material."quotePartId" = qp.id
WHERE material."quoteId" = qid
ORDER BY "order"
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_quote_methods_by_method_id(mid TEXT)
RETURNS TABLE (
    "quoteId" TEXT,
    "quoteLineId" TEXT,
    "methodMaterialId" TEXT,
    "quoteMakeMethodId" TEXT,
    "quoteMaterialMakeMethodId" TEXT,
    "itemId" TEXT,
    "itemReadableId" TEXT,
    "description" TEXT,
    "unitOfMeasureCode" TEXT,
    "itemType" TEXT,
    "itemTrackingType" TEXT,
    "quantity" NUMERIC,
    "unitCost" NUMERIC,
    "methodType" "methodType",
    "parentMaterialId" TEXT,
    "order" DOUBLE PRECISION,
    "isRoot" BOOLEAN,
    "kit" BOOLEAN,
    "revision" TEXT,
    "externalId" JSONB,
    "version" NUMERIC(10,2),
    "storageUnitId" TEXT
) AS $$
WITH RECURSIVE material AS (
    SELECT
        qmm."quoteId",
        qmm."quoteLineId",
        qmm."id",
        qmm."id" AS "quoteMakeMethodId",
        'Make to Order'::"methodType" AS "methodType",
        qmm."id" AS "quoteMaterialMakeMethodId",
        qmm."version",
        qmm."itemId",
        qmm."quotePartId",
        'Part' AS "itemType",
        1::NUMERIC AS "quantity",
        0::NUMERIC AS "unitCost",
        qmm."parentMaterialId",
        CAST(1 AS DOUBLE PRECISION) AS "order",
        TRUE AS "isRoot",
        FALSE AS "kit",
        NULL::TEXT AS "storageUnitId"
    FROM
        "quoteMakeMethod" qmm
    WHERE
        qmm."id" = mid
    UNION
    SELECT
        child."quoteId",
        child."quoteLineId",
        child."id",
        child."quoteMakeMethodId",
        child."methodType",
        child."quoteMaterialMakeMethodId",
        child."version",
        child."itemId",
        NULL::TEXT AS "quotePartId",
        child."itemType",
        child."quantity",
        child."unitCost",
        parent."id" AS "parentMaterialId",
        child."order",
        FALSE AS "isRoot",
        child."kit",
        child."storageUnitId"
    FROM
        "quoteMaterialWithMakeMethodId" child
        INNER JOIN material parent ON parent."quoteMaterialMakeMethodId" = child."quoteMakeMethodId"
    WHERE parent."methodType" = 'Make to Order'
)
SELECT
  material."quoteId",
  material."quoteLineId",
  material.id AS "methodMaterialId",
  material."quoteMakeMethodId",
  material."quoteMaterialMakeMethodId",
  material."itemId",
  COALESCE(item."readableIdWithRevision", qp."name") AS "itemReadableId",
  COALESCE(item."name", qp."name") AS "description",
  COALESCE(item."unitOfMeasureCode", qp."unitOfMeasureCode") AS "unitOfMeasureCode",
  material."itemType",
  item."itemTrackingType",
  material."quantity",
  material."unitCost",
  material."methodType",
  material."parentMaterialId",
  material."order",
  material."isRoot",
  material."kit",
  item."revision",
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
    WHERE eim."entityType" = 'item' AND eim."entityId" = material."itemId"
  ) AS "externalId",
  material."version",
  material."storageUnitId"
FROM material
LEFT JOIN item ON material."itemId" = item.id
LEFT JOIN "quotePart" qp ON material."quotePartId" = qp.id
ORDER BY "order"
$$ LANGUAGE sql STABLE;
