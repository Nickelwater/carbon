
CREATE TYPE "riskSource" AS ENUM (
  'GENERAL',
  'ITEM',
  'ITEM_MASTER',
  'QUOTE_LINE',
  'JOB',
  'WORK_CENTER',
  'SUPPLIER',
  'SUPPLIER_MASTER',
  'CUSTOMER',
  'CUSTOMER_MASTER'
);

CREATE TYPE "riskStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'MITIGATING', 'CLOSED', 'ACCEPTED');

CREATE TABLE "riskRegister" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "source" "riskSource" NOT NULL,
  "severity" INTEGER CHECK (severity BETWEEN 1 AND 5),
  "likelihood" INTEGER CHECK (likelihood BETWEEN 1 AND 5),
  "score" INTEGER,
  "status" "riskStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  -- Optional foreign keys
  "itemId" TEXT,
  "itemMasterId" TEXT,
  "quoteLineId" TEXT,
  "jobId" TEXT,
  "workCenterId" TEXT,
  "supplierId" TEXT,
  "supplierMasterId" TEXT,
  "customerId" TEXT,
  "customerMasterId" TEXT,

  CONSTRAINT "riskRegister_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "riskRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- Foreign key constraints for known tables
  CONSTRAINT "riskRegister_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "quoteLine"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "workCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE

  -- itemMasterId, supplierMasterId, customerMasterId left without FKs as targets are unsure or master tables not clearly identified
);

CREATE INDEX "riskRegister_companyId_idx" ON "riskRegister" ("companyId");
CREATE INDEX "riskRegister_assigneeUserId_idx" ON "riskRegister" ("assigneeUserId");
CREATE INDEX "riskRegister_status_idx" ON "riskRegister" ("status");
CREATE INDEX "riskRegister_source_idx" ON "riskRegister" ("source");

ALTER TABLE "riskRegister" ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- All access is filtered by orgId / tenantId.
-- Any employee should be able to SELECT (view) and INSERT rows.
CREATE POLICY "SELECT" ON "riskRegister"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "riskRegister"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

-- Only employees with `quality_update` should be able to UPDATE rows.
CREATE POLICY "UPDATE" ON "riskRegister"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_update')
    )::text[]
  )
);

-- Only employees with `quality_delete` should be able to DELETE rows.
CREATE POLICY "DELETE" ON "riskRegister"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_delete')
    )::text[]
  )
);
