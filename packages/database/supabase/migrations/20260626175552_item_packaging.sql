-- Per-item packaging settings for shipping labels (box quantity, weight, standard packaging item).
-- Keyed by itemId like itemShelfLife — item-level, not per-location.

CREATE TABLE IF NOT EXISTS "itemPackaging" (
  "itemId" TEXT NOT NULL,
  "boxQuantity" NUMERIC,
  "partWeight" NUMERIC,
  "standardPackagingItemId" TEXT,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "customFields" JSONB,

  CONSTRAINT "itemPackaging_pkey" PRIMARY KEY ("itemId"),
  CONSTRAINT "itemPackaging_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "item"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "itemPackaging_standardPackagingItemId_fkey"
    FOREIGN KEY ("standardPackagingItemId") REFERENCES "item"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "itemPackaging_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "itemPackaging_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "user"("id"),
  CONSTRAINT "itemPackaging_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "user"("id"),
  CONSTRAINT "itemPackaging_boxQuantity_positive"
    CHECK ("boxQuantity" IS NULL OR "boxQuantity" > 0),
  CONSTRAINT "itemPackaging_partWeight_positive"
    CHECK ("partWeight" IS NULL OR "partWeight" > 0)
);

CREATE INDEX IF NOT EXISTS "itemPackaging_companyId_idx"
  ON "itemPackaging" ("companyId");
CREATE INDEX IF NOT EXISTS "itemPackaging_standardPackagingItemId_idx"
  ON "itemPackaging" ("standardPackagingItemId");

ALTER TABLE "itemPackaging" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SELECT" ON "public"."itemPackaging";
CREATE POLICY "SELECT" ON "public"."itemPackaging"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_view'))::text[]
  )
);

DROP POLICY IF EXISTS "INSERT" ON "public"."itemPackaging";
CREATE POLICY "INSERT" ON "public"."itemPackaging"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_create'))::text[]
  )
);

DROP POLICY IF EXISTS "UPDATE" ON "public"."itemPackaging";
CREATE POLICY "UPDATE" ON "public"."itemPackaging"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_update'))::text[]
  )
);

DROP POLICY IF EXISTS "DELETE" ON "public"."itemPackaging";
CREATE POLICY "DELETE" ON "public"."itemPackaging"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_delete'))::text[]
  )
);
