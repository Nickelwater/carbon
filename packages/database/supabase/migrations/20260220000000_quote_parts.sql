-- Quote parts: allow quoting customer part numbers without creating internal items.
-- Quote parts live only on the quote; they can be "promoted" to internal items when a job is awarded.

BEGIN;

-- New table: quotePart (parts internal to a quote, same quoting functionality as item)
CREATE TABLE "quotePart" (
  "id" TEXT NOT NULL DEFAULT xid(),
  "quoteId" TEXT NOT NULL,
  "readableId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "defaultMethodType" "methodType" NOT NULL DEFAULT 'Make',
  "unitOfMeasureCode" TEXT,
  "modelUploadId" TEXT,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "quotePart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quotePart_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "quotePart_unitOfMeasureCode_fkey" FOREIGN KEY ("unitOfMeasureCode", "companyId") REFERENCES "unitOfMeasure" ("code", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quotePart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quotePart_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quotePart_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quotePart_modelUploadId_fkey" FOREIGN KEY ("modelUploadId") REFERENCES "modelUpload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "quotePart_quoteId_idx" ON "quotePart" ("quoteId");
CREATE INDEX "quotePart_companyId_idx" ON "quotePart" ("companyId");

ALTER TABLE "quotePart" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view quote parts" ON "quotePart"
  FOR SELECT USING (
    has_role('employee', "companyId")
    AND "companyId" = ANY (SELECT "companyId" FROM "userToCompany" WHERE "userId" = auth.uid()::text)
  );

CREATE POLICY "Employees with sales create can insert quote parts" ON "quotePart"
  FOR INSERT WITH CHECK (
    has_role('employee', "companyId")
    AND has_company_permission('sales_create', "companyId")
  );

CREATE POLICY "Employees with sales update can update quote parts" ON "quotePart"
  FOR UPDATE USING (
    has_role('employee', "companyId")
    AND has_company_permission('sales_update', "companyId")
  );

CREATE POLICY "Employees with sales delete can delete quote parts" ON "quotePart"
  FOR DELETE USING (
    has_role('employee', "companyId")
    AND has_company_permission('sales_delete', "companyId")
  );

-- quoteLine: either itemId or quotePartId (exactly one for each line)
ALTER TABLE "quoteLine"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN "quotePartId" TEXT REFERENCES "quotePart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "quoteLine_quotePartId_idx" ON "quoteLine" ("quotePartId");

ALTER TABLE "quoteLine" ADD CONSTRAINT "quoteLine_item_or_quote_part_check"
  CHECK (
    ("itemId" IS NOT NULL AND "quotePartId" IS NULL)
    OR ("itemId" IS NULL AND "quotePartId" IS NOT NULL)
  );

-- quoteMakeMethod: for root rows (parentMaterialId IS NULL), either itemId or quotePartId
ALTER TABLE "quoteMakeMethod"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN "quotePartId" TEXT REFERENCES "quotePart" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "quoteMakeMethod_quotePartId_idx" ON "quoteMakeMethod" ("quotePartId");

ALTER TABLE "quoteMakeMethod" ADD CONSTRAINT "quoteMakeMethod_root_item_or_quote_part_check"
  CHECK (
    ("parentMaterialId" IS NOT NULL AND "itemId" IS NOT NULL)
    OR ("parentMaterialId" IS NULL AND (
      ("itemId" IS NOT NULL AND "quotePartId" IS NULL)
      OR ("itemId" IS NULL AND "quotePartId" IS NOT NULL)
    ))
  );

-- Update insert_quote_line_make_method: when quote line has quotePartId, insert quoteMakeMethod with quotePartId
CREATE OR REPLACE FUNCTION insert_quote_line_make_method()
RETURNS TRIGGER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF NEW."quotePartId" IS NOT NULL THEN
    INSERT INTO "quoteMakeMethod" (
      "quoteId", "quoteLineId", "quotePartId", "companyId", "createdAt", "createdBy", "version"
    )
    VALUES (
      NEW."quoteId", NEW."id", NEW."quotePartId", NEW."companyId", NOW(), NEW."createdBy", 0
    );
  ELSIF NEW."itemId" IS NOT NULL THEN
    SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = NEW."itemId";
    INSERT INTO "quoteMakeMethod" (
      "quoteId", "quoteLineId", "itemId", "companyId", "createdAt", "createdBy", "version"
    )
    VALUES (
      NEW."quoteId", NEW."id", NEW."itemId", NEW."companyId", NOW(), NEW."createdBy", COALESCE(v_version, 0)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update update_quote_line_make_method_item_id: handle quotePartId and promotion (itemId set, quotePartId cleared)
CREATE OR REPLACE FUNCTION update_quote_line_make_method_item_id()
RETURNS TRIGGER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF NEW."methodType" != 'Make' THEN
    RETURN NEW;
  END IF;
  IF NEW."quotePartId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "quoteMakeMethod"
      WHERE "quoteLineId" = NEW."id" AND "parentMaterialId" IS NULL
    ) THEN
      INSERT INTO "quoteMakeMethod" (
        "quoteId", "quoteLineId", "quotePartId", "companyId", "createdAt", "createdBy", "version"
      )
      VALUES (
        NEW."quoteId", NEW."id", NEW."quotePartId", NEW."companyId", NOW(), NEW."createdBy", 0
      );
    ELSE
      UPDATE "quoteMakeMethod"
      SET "quotePartId" = NEW."quotePartId", "itemId" = NULL
      WHERE "quoteLineId" = NEW."id" AND "parentMaterialId" IS NULL;
    END IF;
  ELSIF NEW."itemId" IS NOT NULL THEN
    SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = NEW."itemId";
    IF NOT EXISTS (
      SELECT 1 FROM "quoteMakeMethod"
      WHERE "quoteLineId" = NEW."id" AND "parentMaterialId" IS NULL
    ) THEN
      INSERT INTO "quoteMakeMethod" (
        "quoteId", "quoteLineId", "itemId", "companyId", "createdAt", "createdBy", "version"
      )
      VALUES (
        NEW."quoteId", NEW."id", NEW."itemId", NEW."companyId", NOW(), NEW."createdBy", COALESCE(v_version, 0)
      );
    ELSE
      UPDATE "quoteMakeMethod"
      SET "itemId" = NEW."itemId",
          "quotePartId" = NULL,
          "version" = COALESCE(v_version, 0)
      WHERE "quoteLineId" = NEW."id" AND "parentMaterialId" IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger must fire when quotePartId changes (e.g. on promote)
DROP TRIGGER IF EXISTS update_quote_line_make_method_item_id_trigger ON "quoteLine";
CREATE TRIGGER update_quote_line_make_method_item_id_trigger
  AFTER UPDATE OF "itemId", "methodType", "quotePartId" ON "quoteLine"
  FOR EACH ROW
  WHEN (
    (OLD."methodType" = 'Make' AND (OLD."itemId" IS DISTINCT FROM NEW."itemId" OR OLD."quotePartId" IS DISTINCT FROM NEW."quotePartId")) OR
    (NEW."methodType" = 'Make' AND OLD."methodType" <> 'Make')
  )
  EXECUTE FUNCTION update_quote_line_make_method_item_id();

-- Recreate quoteLines view: support both item and quotePart
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

-- get_quote_methods: support root row from quotePart (LEFT JOIN item and quotePart)
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
    "version" NUMERIC(10,2)
) AS $$
WITH RECURSIVE material AS (
    SELECT 
        qmm."quoteId",
        qmm."quoteLineId",
        qmm."id", 
        qmm."id" AS "quoteMakeMethodId",
        'Make'::"methodType" AS "methodType",
        qmm."id" AS "quoteMaterialMakeMethodId",
        qmm."itemId", 
        qmm."quotePartId",
        'Part' AS "itemType",
        1::NUMERIC AS "quantity",
        0::NUMERIC AS "unitCost",
        "parentMaterialId",
        CAST(1 AS DOUBLE PRECISION) AS "order",
        TRUE AS "isRoot",
        FALSE AS "kit",
        qmm."version"
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
        child."version"
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
  material."version"
FROM material
LEFT JOIN item ON material."itemId" = item.id
LEFT JOIN "quotePart" qp ON material."quotePartId" = qp.id
WHERE material."quoteId" = qid
ORDER BY "order"
$$ LANGUAGE sql STABLE;

-- get_quote_methods_by_method_id: support root row from quotePart
DROP FUNCTION IF EXISTS get_quote_methods_by_method_id(TEXT);
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
    "shelfId" TEXT
) AS $$
WITH RECURSIVE material AS (
    SELECT 
        qmm."quoteId",
        qmm."quoteLineId",
        qmm."id", 
        qmm."id" AS "quoteMakeMethodId",
        'Make'::"methodType" AS "methodType",
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
        NULL::TEXT AS "shelfId"
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
        child."shelfId"
    FROM 
        "quoteMaterialWithMakeMethodId" child 
        INNER JOIN material parent ON parent."quoteMaterialMakeMethodId" = child."quoteMakeMethodId"
    WHERE parent."methodType" = 'Make'
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
  material."shelfId"
FROM material
LEFT JOIN item ON material."itemId" = item.id
LEFT JOIN "quotePart" qp ON material."quotePartId" = qp.id
ORDER BY "order"
$$ LANGUAGE sql STABLE;

COMMIT;
