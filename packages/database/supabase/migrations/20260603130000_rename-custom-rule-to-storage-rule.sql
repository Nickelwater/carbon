-- Rename the Custom Rules feature to Storage Rules (now lives in the Inventory
-- module). Table/enum/customField rename only — the column set is unchanged.
--
-- Constraint and index names keep their legacy `customRule*` prefix: they are
-- internal identifiers never referenced by application code, and renaming them
-- adds churn + failure surface for no functional gain.
--
-- No-op when custom rules were never installed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'customRule'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE "customRule" RENAME TO "storageRule";

  ALTER TABLE "customRuleItemAssignment" RENAME TO "storageRuleItemAssignment";
  ALTER TABLE "customRuleWorkCenterAssignment"
    RENAME TO "storageRuleWorkCenterAssignment";

  ALTER TYPE "customRuleTargetType" RENAME TO "storageRuleTargetType";

  UPDATE "customFieldTable"
     SET "table" = 'storageRule',
         "name"  = 'Storage Rule'
   WHERE "table" = 'customRule';
END $$;
