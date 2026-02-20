-- Add contract customer flag for contract manufacturing: when true, sales order
-- item selection shows customer part numbers for this customer only.
ALTER TABLE "customer"
  ADD COLUMN IF NOT EXISTS "contractCustomer" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "customer"."contractCustomer" IS 'When true, sales order line item dropdown shows this customer''s part numbers (customerPartToItem) instead of internal part numbers.';

-- Expose the new column in the customers view (recreate from latest definition)
DROP VIEW IF EXISTS "customers";
CREATE OR REPLACE VIEW "customers" WITH(SECURITY_INVOKER=true) AS
  SELECT
    c.id,
    c.name,
    c."customerTypeId",
    c."customerStatusId",
    c."taxId",
    c."accountManagerId",
    c.logo,
    c.assignee,
    c."taxPercent",
    c.website,
    c."companyId",
    c."createdAt",
    c."createdBy",
    c."updatedAt",
    c."updatedBy",
    c."customFields",
    c."currencyCode",
    c."salesContactId",
    c."invoicingContactId",
    c."defaultCc",
    c."contractCustomer",
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
      WHERE eim."entityType" = 'customer' AND eim."entityId" = c.id
    ) AS "externalId",
    ct.name AS "type",
    cs.name AS "status",
    so.count AS "orderCount",
    pc."workPhone" AS "phone",
    pc."fax" AS "fax"
  FROM "customer" c
  LEFT JOIN "customerType" ct ON ct.id = c."customerTypeId"
  LEFT JOIN "customerStatus" cs ON cs.id = c."customerStatusId"
  LEFT JOIN (
    SELECT
      "customerId",
      COUNT(*) AS "count"
    FROM "salesOrder"
    GROUP BY "customerId"
  ) so ON so."customerId" = c.id
  LEFT JOIN (
    SELECT DISTINCT ON (cc."customerId")
      cc."customerId",
      co."workPhone",
      co."fax"
    FROM "customerContact" cc
    INNER JOIN "contact" co ON co.id = cc."contactId"
    ORDER BY cc."customerId"
  ) pc ON pc."customerId" = c.id;
