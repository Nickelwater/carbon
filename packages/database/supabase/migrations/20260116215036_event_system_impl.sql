-- Event System Engine

-- 1. PGMQ Create Queue
-- ------------------------------------------------------------------
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'event_system') THEN
      PERFORM pgmq.create('event_system');
   END IF;
END $$;


-- 2. Create the Subscription Registry (Strict Multi-Tenant)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS "eventSystemSubscription";

CREATE TABLE "eventSystemSubscription" (
    "id" TEXT PRIMARY KEY DEFAULT id(),
    "name" TEXT NOT NULL,
    
    -- Tenant Isolation
    "companyId" TEXT NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,

    -- Matching Rules
    "table" TEXT NOT NULL,
    "operations" TEXT [] NOT NULL CHECK ("operations" <@ ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']::text[]),
    "filter" JSONB DEFAULT '{}'::jsonb,

    -- Handler Logic
    "handlerType" TEXT NOT NULL CHECK ("handlerType" IN ('WEBHOOK', 'WORKFLOW', 'SYNC')),
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "batchSize" INTEGER DEFAULT 50,

    -- Metadata
    "active" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints: Unique name per company
    CONSTRAINT "unique_subscription_name_per_company" UNIQUE ("companyId", "name", "table")
);

-- OPTIMIZATION: Partial Index for High-Performance Dispatch
-- Filters by Table AND Company, but only for active subscriptions.
CREATE INDEX "idx_eventSystemSubscription_dispatch" 
ON "eventSystemSubscription" ("table", "companyId") 
WHERE "active" = TRUE;


-- 3. Row Level Security
-- ------------------------------------------------------------------
ALTER TABLE "eventSystemSubscription" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage_subscriptions" ON "eventSystemSubscription"
FOR ALL USING ( auth.role() = 'authenticated' ); 


-- 4. Sync Triggers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_event_interceptors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  func_name TEXT;
  payload_data JSONB;
  old_payload_data JSONB;
  i INTEGER;
BEGIN
  -- A. Normalize Data
  IF TG_OP = 'DELETE' THEN
    payload_data := row_to_json(OLD)::jsonb;
    old_payload_data := payload_data;
  ELSIF TG_OP = 'INSERT' THEN
    payload_data := row_to_json(NEW)::jsonb;
    old_payload_data := NULL;
  ELSE -- UPDATE
    payload_data := row_to_json(NEW)::jsonb;
    old_payload_data := row_to_json(OLD)::jsonb;
  END IF;

  -- B. Execute Interceptor Functions
  -- Loop through arguments passed in CREATE TRIGGER ... EXECUTE FUNCTION func(arg1, arg2)
  FOR i IN 0 .. (TG_NARGS - 1) LOOP
    func_name := TG_ARGV[i];
    EXECUTE format('SELECT %I($1, $2, $3, $4)', func_name)
    USING TG_TABLE_NAME, TG_OP, payload_data, old_payload_data;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


-- 5. Async Triggers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_event_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
DECLARE
  sub RECORD;
  msg_batch JSONB[];
  rec_company_id TEXT;
  has_subs BOOLEAN;
BEGIN
  -- Guard: Skip if we're in a sync operation (prevents circular triggers)
  -- Set this via: SET LOCAL "app.sync_in_progress" = 'true';
  IF current_setting('app.sync_in_progress', true) = 'true' THEN
    RETURN NULL;
  END IF;

  -- A. Extract Company ID (Partition Key)
  -- We need this to efficiently filter subscriptions.
  -- NOTE: For STATEMENT-level triggers, OLD/NEW are not available.
  -- We must query the transition tables (batched_new/batched_old) instead.
  IF TG_OP = 'DELETE' THEN
    SELECT t."companyId" INTO rec_company_id FROM batched_old t LIMIT 1;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT t."companyId" INTO rec_company_id FROM batched_new t LIMIT 1;
  ELSE -- UPDATE
    SELECT t."companyId" INTO rec_company_id FROM batched_new t LIMIT 1;
  END IF;

  -- Performance Guard: If record has no companyId, we can't match any subscriptions.
  IF rec_company_id IS NULL THEN RETURN NULL; END IF;

  -- B. Fast Check: Any active subscriptions for this Company + Table + Op?
  SELECT EXISTS (
    SELECT 1 FROM "eventSystemSubscription" 
    WHERE "table" = TG_TABLE_NAME 
    AND "companyId" = rec_company_id -- Use the Index!
    AND "active" = TRUE 
    AND TG_OP = ANY("operations")
  ) INTO has_subs;

  IF NOT has_subs THEN RETURN NULL; END IF;


  -- C. Iterate Subscriptions (Filtered by Company)
  FOR sub IN 
    SELECT * FROM "eventSystemSubscription" 
    WHERE "table" = TG_TABLE_NAME 
      AND "companyId" = rec_company_id -- Use the Index!
      AND "active" = TRUE 
      AND TG_OP = ANY("operations")
  LOOP
    
    -- D. Build Batch Payload
    -- Filter rows using the subscription's JSONB filter
    -- Only include rows belonging to the correct companyId (Redundant but safe)

    IF TG_OP = 'INSERT' THEN
        SELECT array_agg(
            jsonb_build_object(
                'subscriptionId', sub.id,
                'triggerType', TG_LEVEL,
                'handlerType', sub."handlerType",
                'handlerConfig', sub."config",
                'companyId', rec_company_id,
                'event', jsonb_build_object(
                    'table', TG_TABLE_NAME, 
                    'operation', TG_OP, 
                    'recordId', t.id, 
                    'new', row_to_json(t)::jsonb, 
                    'old', null,
                    'timestamp', NOW()
                )
            )
        ) INTO msg_batch
        FROM batched_new t
        WHERE t."companyId" = rec_company_id
          AND (sub.filter = '{}'::jsonb OR row_to_json(t)::jsonb @> sub.filter);

    ELSIF TG_OP = 'DELETE' THEN
        SELECT array_agg(
            jsonb_build_object(
                'subscriptionId', sub.id,
                'triggerType', TG_LEVEL,
                'handlerType', sub."handlerType",
                'handlerConfig', sub."config",
                'companyId', rec_company_id,
                'event', jsonb_build_object(
                    'table', TG_TABLE_NAME, 
                    'operation', TG_OP, 
                    'recordId', t.id, 
                    'new', null, 
                    'old', row_to_json(t)::jsonb,
                    'timestamp', NOW()
                )
            )
        ) INTO msg_batch
        FROM batched_old t
        WHERE t."companyId" = rec_company_id
          AND (sub.filter = '{}'::jsonb OR row_to_json(t)::jsonb @> sub.filter);

    ELSIF TG_OP = 'UPDATE' THEN
        SELECT array_agg(
            jsonb_build_object(
                'subscriptionId', sub.id,
                'triggerType', TG_LEVEL,
                'handlerType', sub."handlerType",
                'handlerConfig', sub."config",
                'companyId', rec_company_id,
                'event', jsonb_build_object(
                    'table', TG_TABLE_NAME, 
                    'operation', TG_OP, 
                    'recordId', n.id, 
                    'new', row_to_json(n)::jsonb, 
                    'old', row_to_json(o)::jsonb,
                    'timestamp', NOW()
                )
            )
        ) INTO msg_batch
        FROM batched_new n
        JOIN batched_old o ON n.id = o.id
        WHERE n."companyId" = rec_company_id
          AND (sub.filter = '{}'::jsonb OR row_to_json(n)::jsonb @> sub.filter);
    END IF;

    -- E. Send Batch (PGMQ)
    IF msg_batch IS NOT NULL AND array_length(msg_batch, 1) > 0 THEN
      PERFORM pgmq.send_batch('event_system', msg_batch);
    END IF;

  END LOOP;

  RETURN NULL;
END;
$$;


-- 6. Trigger Attachment Helper
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_event_trigger(
  table_name_text TEXT, 
  sync_functions TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS VOID AS $$
DECLARE
  sync_args TEXT;
BEGIN
  -- A. Attach SYNC Trigger (Row Level)
  IF array_length(sync_functions, 1) > 0 THEN
      SELECT string_agg(quote_literal(x), ', ') INTO sync_args FROM unnest(sync_functions) x;
      
      EXECUTE format('
        DROP TRIGGER IF EXISTS "trg_event_sync_%1$s" ON %1$I;
        CREATE TRIGGER "trg_event_sync_%1$s"
        BEFORE INSERT OR UPDATE OR DELETE ON %1$I
        FOR EACH ROW 
        EXECUTE FUNCTION public.dispatch_event_interceptors(%2$s);
      ', table_name_text, sync_args);
  ELSE
      EXECUTE format('DROP TRIGGER IF EXISTS "trg_event_sync_%1$s" ON %1$I;', table_name_text);
  END IF;

  -- B. Attach ASYNC Triggers (Statement Level)
  -- 1. INSERT
  EXECUTE format('
    DROP TRIGGER IF EXISTS "trg_event_async_ins_%1$s" ON %1$I;
    CREATE TRIGGER "trg_event_async_ins_%1$s"
    AFTER INSERT ON %1$I
    REFERENCING NEW TABLE AS batched_new
    FOR EACH STATEMENT 
    EXECUTE FUNCTION public.dispatch_event_batch();
  ', table_name_text);

  -- 2. DELETE
  EXECUTE format('
    DROP TRIGGER IF EXISTS "trg_event_async_del_%1$s" ON %1$I;
    CREATE TRIGGER "trg_event_async_del_%1$s"
    AFTER DELETE ON %1$I
    REFERENCING OLD TABLE AS batched_old
    FOR EACH STATEMENT 
    EXECUTE FUNCTION public.dispatch_event_batch();
  ', table_name_text);

  -- 3. UPDATE
  EXECUTE format('
    DROP TRIGGER IF EXISTS "trg_event_async_upd_%1$s" ON %1$I;
    CREATE TRIGGER "trg_event_async_upd_%1$s"
    AFTER UPDATE ON %1$I
    REFERENCING NEW TABLE AS batched_new OLD TABLE AS batched_old
    FOR EACH STATEMENT 
    EXECUTE FUNCTION public.dispatch_event_batch();
  ', table_name_text);

END;
$$ LANGUAGE plpgsql;


-- 7. Status View
-- ------------------------------------------------------------------
DROP VIEW IF EXISTS "eventSystemTrigger";

CREATE VIEW "eventSystemTrigger" AS
SELECT 
    t.tgrelid::regclass::text AS "tableName",
    
    -- Friendly Type Name
    CASE 
        WHEN t.tgname LIKE 'trg_event_sync_%' THEN 'SYNC (ROW)'
        WHEN t.tgname LIKE 'trg_event_async_%' THEN 'ASYNC (STATEMENT)'
        ELSE 'UNKNOWN'
    END AS "type",

    -- Cleaned Function List
    CASE 
        WHEN t.tgname LIKE 'trg_event_sync_%' THEN 
           -- Regex to extract args from "dispatch_event_interceptors('func1', 'func2')"
           REPLACE(
             REPLACE(
               substring(pg_get_triggerdef(t.oid) FROM 'dispatch_event_interceptors\((.*)\)'), 
               '''', ''
             ), 
             ', ', ' → '
           )
        ELSE 'PGMQ Batch'
    END AS "attachedFunctions",

    -- Status Badge
    CASE 
        WHEN t.tgenabled = 'O' THEN 'Active'
        WHEN t.tgenabled = 'D' THEN 'Disabled'
        ELSE 'Replica Only'
    END AS "status",
    
    t.tgname AS "systemTriggerName"
FROM pg_trigger t
WHERE t.tgname LIKE 'trg_event_%'
ORDER BY "tableName", "type" DESC;