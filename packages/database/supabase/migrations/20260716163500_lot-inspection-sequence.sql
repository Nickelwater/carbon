-- Separate sequence for job-completion (lot) inspections. Historical Job
-- rows keep their II… readable ids; new lots allocate LI… via create-inspection-lot.

INSERT INTO "sequence" ("table", "name", "prefix", "suffix", "next", "size", "step", "companyId")
SELECT
  'lotInspection',
  'Lot Inspection',
  'LI',
  NULL,
  0,
  6,
  1,
  "id"
FROM "company"
ON CONFLICT ("table", "companyId") DO NOTHING;
