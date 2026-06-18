-- Material supersession & run-out management (phase 1: data capture).
--
-- Supersession models the transition from one part number to a different part
-- number (distinct from revisions, which track the same part across engineering
-- changes). The mode implies the MRP behaviour and the derived lifecycle status
-- shown on the item header:
--   'Consume First' / 'Prefer New' -> Phase-out
--   'Stock Only'                   -> Spares only
--   'No Stock'                     -> Obsolete
--   no row                         -> Active (no supersession)
--
-- Supersession lives in its own relation table (not on itemReplenishment):
-- a second FK to "item" on itemReplenishment would make every existing
-- item <-> itemReplenishment PostgREST embed ambiguous. A dedicated table keys
-- one supersession config per item (global, like the lifecycle badge) and the
-- successorItemId index powers the "supersedes" back-reference on the
-- successor's record. The per-location minimum service-stock reserve lives on
-- itemPlanning (one row per item + location).
-- Phase 1 captures data only; MRP enforcement is a follow-on.

CREATE TYPE "supersessionMode" AS ENUM (
  'Consume First',
  'Prefer New',
  'Stock Only',
  'No Stock'
);

CREATE TABLE "itemSupersession" (
  "itemId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "supersessionMode" "supersessionMode" NOT NULL,
  "successorItemId" TEXT,
  "discontinuationDate" DATE,
  "successorEffectivityDate" DATE,

  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "itemSupersession_pkey" PRIMARY KEY ("itemId"),
  CONSTRAINT "itemSupersession_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "itemSupersession_successorItemId_fkey" FOREIGN KEY ("successorItemId") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "itemSupersession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "itemSupersession_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id"),
  CONSTRAINT "itemSupersession_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id"),
  CONSTRAINT "itemSupersession_successorItemId_not_self"
    CHECK ("successorItemId" IS NULL OR "successorItemId" != "itemId"),
  CONSTRAINT "itemSupersession_successorEffectivityDate_check"
    CHECK (
      "successorEffectivityDate" IS NULL
      OR "discontinuationDate" IS NULL
      OR "successorEffectivityDate" >= "discontinuationDate"
    )
);

CREATE INDEX "itemSupersession_companyId_idx" ON "itemSupersession" ("companyId");
-- Powers the "Supersedes" back-reference lookup on the successor's record.
CREATE INDEX "itemSupersession_successorItemId_idx"
  ON "itemSupersession" ("successorItemId")
  WHERE "successorItemId" IS NOT NULL;

ALTER TABLE "public"."itemSupersession" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."itemSupersession"
FOR SELECT USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_role())::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."itemSupersession"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_create'))::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."itemSupersession"
FOR UPDATE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_update'))::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."itemSupersession"
FOR DELETE USING (
  "companyId" = ANY (
    (SELECT get_companies_with_employee_permission('parts_delete'))::text[]
  )
);

-- Per-location minimum service-stock floor (used by 'Stock Only' / 'Prefer New').
ALTER TABLE "itemPlanning"
  ADD COLUMN "minimumReserveQuantity" NUMERIC NOT NULL DEFAULT 0;
