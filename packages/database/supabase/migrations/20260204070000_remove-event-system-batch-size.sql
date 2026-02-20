-- Remove unused batchSize column from eventSystemSubscription
-- This field was never actually used in the event processing logic

ALTER TABLE "eventSystemSubscription" DROP COLUMN IF EXISTS "batchSize";
