-- Custom Rules: remove the `storageUnit` target type.
--
-- Bin-level `place`/`pick` guards are now owned by item-target rules (which
-- already expose the `storageUnit.*` context fields), so storage-unit rules are
-- redundant. The feature is new, so existing storage-unit rules are DELETED
-- rather than migrated.
--
-- No-op when custom rules were never installed (e.g. fork DBs without upstream
-- custom-rules migrations).

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

  DELETE FROM "customRule" WHERE "targetType" = 'storageUnit';

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'customRuleStorageUnitAssignment'
  ) THEN
    DROP TABLE "customRuleStorageUnitAssignment";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'customRuleTargetType'
      AND e.enumlabel = 'storageUnit'
  ) THEN
    ALTER TABLE "customRule" ALTER COLUMN "targetType" DROP DEFAULT;
    ALTER TYPE "customRuleTargetType" RENAME TO "customRuleTargetType_old";
    CREATE TYPE "customRuleTargetType" AS ENUM ('item', 'workCenter');
    ALTER TABLE "customRule"
      ALTER COLUMN "targetType" TYPE "customRuleTargetType"
      USING "targetType"::text::"customRuleTargetType";
    ALTER TABLE "customRule" ALTER COLUMN "targetType" SET DEFAULT 'item';
    DROP TYPE "customRuleTargetType_old";
  END IF;
END $$;
