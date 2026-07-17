-- Phase 3.3: In-Process inspection evaluator wiring
-- 1. 'Cancelled' status for inspection headers (in-process runs cancelled when
--    a quantity correction drops a pending/in-progress ordinal below threshold).
-- 2. IP… sequence for in-process inspection readable ids.
-- 3. WORKFLOW subscriptions routing productionQuantity/productionEvent writes
--    to the evaluate-in-process-inspections inngest function (see
--    packages/jobs/src/inngest/functions/events/workflow.ts).

ALTER TYPE "inboundInspectionStatus" ADD VALUE IF NOT EXISTS 'Cancelled';

INSERT INTO "sequence" ("table", "name", "prefix", "suffix", "next", "size", "step", "companyId")
SELECT
  'inProcessInspection',
  'In-Process Inspection',
  'IP',
  NULL,
  0,
  6,
  1,
  "id"
FROM "company"
ON CONFLICT ("table", "companyId") DO NOTHING;

INSERT INTO "eventSystemSubscription" ("name", "companyId", "table", "operations", "handlerType", "config")
SELECT
  'evaluate-in-process-inspections-production-quantity',
  "id",
  'productionQuantity',
  ARRAY['INSERT', 'UPDATE']::text[],
  'WORKFLOW',
  '{"workflowId": "evaluate-in-process-inspections"}'::jsonb
FROM "company"
ON CONFLICT ("companyId", "name", "table") DO NOTHING;

INSERT INTO "eventSystemSubscription" ("name", "companyId", "table", "operations", "handlerType", "config")
SELECT
  'evaluate-in-process-inspections-production-event',
  "id",
  'productionEvent',
  ARRAY['INSERT', 'UPDATE']::text[],
  'WORKFLOW',
  '{"workflowId": "evaluate-in-process-inspections"}'::jsonb
FROM "company"
ON CONFLICT ("companyId", "name", "table") DO NOTHING;
