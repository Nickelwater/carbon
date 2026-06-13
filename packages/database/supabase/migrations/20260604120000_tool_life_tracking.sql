-- Tool life tracking: policy on tool, per-serial life on trackedEntity, ledger history,
-- job operation tool issuance, and accrual functions.

CREATE TYPE "toolLifeBasis" AS ENUM ('Cycles', 'RunTime');

CREATE TYPE "toolLifeLedgerSourceType" AS ENUM (
  'Manual',
  'Reset',
  'AutoIssue',
  'ProductionCycles',
  'ProductionRunTime',
  'ScrapCycles',
  'ScrapRunTime'
);

ALTER TABLE "tool"
  ADD COLUMN IF NOT EXISTS "lifeBasis" "toolLifeBasis",
  ADD COLUMN IF NOT EXISTS "lifeLimit" NUMERIC,
  ADD COLUMN IF NOT EXISTS "lifeRemaining" NUMERIC,
  ADD COLUMN IF NOT EXISTS "isPermanent" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "dedicatedPartReadableId" TEXT;

ALTER TABLE "trackedEntity"
  ADD COLUMN IF NOT EXISTS "lifeRemaining" NUMERIC;

ALTER TABLE "jobOperationTool"
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "issuedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "autoIssued" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "trackedEntityId" TEXT;

ALTER TABLE "jobOperationTool"
  ADD CONSTRAINT "jobOperationTool_issuedBy_fkey"
    FOREIGN KEY ("issuedBy") REFERENCES "user"("id") ON DELETE RESTRICT;

ALTER TABLE "jobOperationTool"
  ADD CONSTRAINT "jobOperationTool_trackedEntityId_fkey"
    FOREIGN KEY ("trackedEntityId") REFERENCES "trackedEntity"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "jobOperationTool_trackedEntityId_idx"
  ON "jobOperationTool" ("trackedEntityId");

CREATE TABLE "toolLifeLedger" (
  "id" TEXT NOT NULL DEFAULT xid(),
  "toolId" TEXT NOT NULL,
  "trackedEntityId" TEXT,
  "companyId" TEXT NOT NULL,
  "delta" NUMERIC NOT NULL,
  "balanceAfter" NUMERIC NOT NULL,
  "sourceType" "toolLifeLedgerSourceType" NOT NULL,
  "sourceId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy" TEXT,

  CONSTRAINT "toolLifeLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "toolLifeLedger_toolId_fkey"
    FOREIGN KEY ("toolId", "companyId") REFERENCES "tool"("id", "companyId") ON DELETE CASCADE,
  CONSTRAINT "toolLifeLedger_trackedEntityId_fkey"
    FOREIGN KEY ("trackedEntityId") REFERENCES "trackedEntity"("id") ON DELETE SET NULL,
  CONSTRAINT "toolLifeLedger_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company"("id"),
  CONSTRAINT "toolLifeLedger_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX "toolLifeLedger_toolId_createdAt_idx"
  ON "toolLifeLedger" ("toolId", "createdAt" DESC);

CREATE INDEX "toolLifeLedger_trackedEntityId_idx"
  ON "toolLifeLedger" ("trackedEntityId");

ALTER TABLE "toolLifeLedger" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees with parts_view can view tool life ledger" ON "toolLifeLedger"
  FOR SELECT
  USING (
    has_role('employee', "companyId") AND
    has_company_permission('parts_view', "companyId")
  );

CREATE POLICY "Employees with parts_update can insert tool life ledger" ON "toolLifeLedger"
  FOR INSERT
  WITH CHECK (
    has_role('employee', "companyId") AND
    has_company_permission('parts_update', "companyId")
  );

-- Resolve readableId from item revision id
CREATE OR REPLACE FUNCTION resolve_tool_readable_id(p_item_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT i."readableId"
  FROM "item" i
  WHERE i."id" = p_item_id
  LIMIT 1;
$$;

-- Insert ledger row and update remaining balance on tool master or tracked entity
CREATE OR REPLACE FUNCTION apply_tool_life_delta(
  p_tool_readable_id TEXT,
  p_company_id TEXT,
  p_tracked_entity_id TEXT,
  p_delta NUMERIC,
  p_source_type "toolLifeLedgerSourceType",
  p_source_id TEXT,
  p_reason TEXT,
  p_user_id TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF p_tracked_entity_id IS NOT NULL THEN
    SELECT te."lifeRemaining" INTO v_balance
    FROM "trackedEntity" te
    WHERE te."id" = p_tracked_entity_id
    FOR UPDATE;

    v_new_balance := COALESCE(v_balance, 0) + p_delta;

    UPDATE "trackedEntity"
    SET "lifeRemaining" = v_new_balance
    WHERE "id" = p_tracked_entity_id;
  ELSE
    SELECT t."lifeRemaining" INTO v_balance
    FROM "tool" t
    WHERE t."id" = p_tool_readable_id
      AND t."companyId" = p_company_id
    FOR UPDATE;

    v_new_balance := COALESCE(v_balance, 0) + p_delta;

    UPDATE "tool"
    SET "lifeRemaining" = v_new_balance,
        "updatedAt" = NOW(),
        "updatedBy" = p_user_id
    WHERE "id" = p_tool_readable_id
      AND "companyId" = p_company_id;
  END IF;

  INSERT INTO "toolLifeLedger" (
    "toolId",
    "trackedEntityId",
    "companyId",
    "delta",
    "balanceAfter",
    "sourceType",
    "sourceId",
    "reason",
    "createdBy"
  ) VALUES (
    p_tool_readable_id,
    p_tracked_entity_id,
    p_company_id,
    p_delta,
    v_new_balance,
    p_source_type,
    p_source_id,
    p_reason,
    p_user_id
  );

  RETURN v_new_balance;
END;
$$;

-- Accrue tool life for all issued tools on a job operation
CREATE OR REPLACE FUNCTION accrue_tool_life_for_operation(
  p_job_operation_id TEXT,
  p_quantity_parts NUMERIC,
  p_event_type TEXT,
  p_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_op RECORD;
  v_tool_row RECORD;
  v_tool_readable_id TEXT;
  v_is_serial BOOLEAN;
  v_cycles NUMERIC;
  v_run_time NUMERIC;
  v_consumption NUMERIC;
  v_source_cycles "toolLifeLedgerSourceType";
  v_source_runtime "toolLifeLedgerSourceType";
BEGIN
  SELECT
    jo."companyId",
    jo."partsPerCycle",
    jo."machineTime"
  INTO v_op
  FROM "jobOperation" jo
  WHERE jo."id" = p_job_operation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cycles := CASE
    WHEN COALESCE(v_op."partsPerCycle", 1) <= 0 THEN p_quantity_parts
    ELSE p_quantity_parts / v_op."partsPerCycle"
  END;

  v_run_time := v_cycles * COALESCE(v_op."machineTime", 0);

  IF p_event_type = 'scrap' THEN
    v_source_cycles := 'ScrapCycles';
    v_source_runtime := 'ScrapRunTime';
  ELSE
    v_source_cycles := 'ProductionCycles';
    v_source_runtime := 'ProductionRunTime';
  END IF;

  FOR v_tool_row IN
    SELECT
      jot."id",
      jot."toolId",
      jot."quantity",
      jot."trackedEntityId",
      t."lifeBasis",
      t."lifeLimit",
      i."itemTrackingType"
    FROM "jobOperationTool" jot
    INNER JOIN "item" i ON i."id" = jot."toolId"
    INNER JOIN "tool" t ON t."id" = i."readableId" AND t."companyId" = jot."companyId"
    WHERE jot."operationId" = p_job_operation_id
      AND jot."issuedAt" IS NOT NULL
      AND t."lifeBasis" IS NOT NULL
  LOOP
    v_tool_readable_id := resolve_tool_readable_id(v_tool_row."toolId");
    v_is_serial := v_tool_row."itemTrackingType" = 'Serial';

    IF v_tool_row."lifeBasis" = 'Cycles' THEN
      v_consumption := v_cycles * v_tool_row."quantity";
      PERFORM apply_tool_life_delta(
        v_tool_readable_id,
        v_op."companyId",
        CASE WHEN v_is_serial THEN v_tool_row."trackedEntityId" ELSE NULL END,
        -v_consumption,
        v_source_cycles,
        p_job_operation_id,
        NULL,
        p_user_id
      );
    ELSIF v_tool_row."lifeBasis" = 'RunTime' THEN
      v_consumption := v_run_time * v_tool_row."quantity";
      PERFORM apply_tool_life_delta(
        v_tool_readable_id,
        v_op."companyId",
        CASE WHEN v_is_serial THEN v_tool_row."trackedEntityId" ELSE NULL END,
        -v_consumption,
        v_source_runtime,
        p_job_operation_id,
        NULL,
        p_user_id
      );
    END IF;
  END LOOP;
END;
$$;

-- Auto-issue permanent tools: single serial auto-select; multiple serials require manual selection
CREATE OR REPLACE FUNCTION auto_issue_permanent_job_operation_tools(
  p_job_operation_id TEXT,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_row RECORD;
  v_active_serial_count INTEGER;
  v_single_serial_id TEXT;
  v_errors JSONB := '[]'::jsonb;
  v_requires_selection JSONB := '[]'::jsonb;
BEGIN
  FOR v_row IN
    SELECT
      jot."id" AS job_operation_tool_id,
      jot."toolId",
      jot."companyId",
      jot."issuedAt",
      t."isPermanent",
      t."lifeBasis",
      i."itemTrackingType",
      i."readableId" AS tool_readable_id
    FROM "jobOperationTool" jot
    INNER JOIN "item" i ON i."id" = jot."toolId"
    INNER JOIN "tool" t ON t."id" = i."readableId" AND t."companyId" = jot."companyId"
    WHERE jot."operationId" = p_job_operation_id
      AND t."isPermanent" = TRUE
      AND jot."issuedAt" IS NULL
  LOOP
    IF v_row."itemTrackingType" = 'Serial' THEN
      SELECT COUNT(*), MIN(te."id")
      INTO v_active_serial_count, v_single_serial_id
      FROM "trackedEntity" te
      WHERE te."itemId" = v_row."toolId"
        AND te."companyId" = v_row."companyId"
        AND te."status" IN ('Available', 'Reserved');

      IF v_active_serial_count = 0 THEN
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'jobOperationToolId', v_row.job_operation_tool_id,
            'message', 'No active serial found for permanent tool'
          )
        );
      ELSIF v_active_serial_count = 1 THEN
        UPDATE "jobOperationTool"
        SET
          "issuedAt" = NOW(),
          "issuedBy" = NULL,
          "autoIssued" = TRUE,
          "trackedEntityId" = v_single_serial_id,
          "updatedAt" = NOW(),
          "updatedBy" = p_user_id
        WHERE "id" = v_row.job_operation_tool_id;

        IF v_row."lifeBasis" IS NOT NULL THEN
          PERFORM apply_tool_life_delta(
            v_row.tool_readable_id,
            v_row."companyId",
            v_single_serial_id,
            0,
            'AutoIssue',
            p_job_operation_id,
            'Auto-issued permanent tool (single active serial)',
            NULL
          );
        END IF;
      ELSE
        v_requires_selection := v_requires_selection || jsonb_build_array(
          jsonb_build_object(
            'jobOperationToolId', v_row.job_operation_tool_id,
            'toolId', v_row."toolId"
          )
        );
      END IF;
    ELSE
      UPDATE "jobOperationTool"
      SET
        "issuedAt" = NOW(),
        "issuedBy" = NULL,
        "autoIssued" = TRUE,
        "updatedAt" = NOW(),
        "updatedBy" = p_user_id
      WHERE "id" = v_row.job_operation_tool_id;

      IF v_row."lifeBasis" IS NOT NULL THEN
        PERFORM apply_tool_life_delta(
          v_row.tool_readable_id,
          v_row."companyId",
          NULL,
          0,
          'AutoIssue',
          p_job_operation_id,
          'Auto-issued permanent tool',
          NULL
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'errors', v_errors,
    'requiresSelection', v_requires_selection
  );
END;
$$;

-- Manual issue a job operation tool (serial selection or non-permanent)
CREATE OR REPLACE FUNCTION issue_job_operation_tool(
  p_job_operation_tool_id TEXT,
  p_tracked_entity_id TEXT,
  p_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_row RECORD;
  v_tool_readable_id TEXT;
BEGIN
  SELECT
    jot.*,
    i."itemTrackingType",
    i."readableId" AS tool_readable_id,
    t."lifeBasis"
  INTO v_row
  FROM "jobOperationTool" jot
  INNER JOIN "item" i ON i."id" = jot."toolId"
  INNER JOIN "tool" t ON t."id" = i."readableId" AND t."companyId" = jot."companyId"
  WHERE jot."id" = p_job_operation_tool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job operation tool not found';
  END IF;

  IF v_row."issuedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Tool already issued on this operation';
  END IF;

  IF v_row."itemTrackingType" = 'Serial' AND p_tracked_entity_id IS NULL THEN
    RAISE EXCEPTION 'Serial tool requires trackedEntityId';
  END IF;

  UPDATE "jobOperationTool"
  SET
    "issuedAt" = NOW(),
    "issuedBy" = p_user_id,
    "autoIssued" = FALSE,
    "trackedEntityId" = p_tracked_entity_id,
    "updatedAt" = NOW(),
    "updatedBy" = p_user_id
  WHERE "id" = p_job_operation_tool_id;

  IF v_row."lifeBasis" IS NOT NULL THEN
    PERFORM apply_tool_life_delta(
      v_row.tool_readable_id,
      v_row."companyId",
      p_tracked_entity_id,
      0,
      'AutoIssue',
      v_row."operationId",
      'Issued tool to operation',
      p_user_id
    );
  END IF;
END;
$$;

-- Manual tool life adjustment
CREATE OR REPLACE FUNCTION adjust_tool_life(
  p_tool_readable_id TEXT,
  p_company_id TEXT,
  p_tracked_entity_id TEXT,
  p_new_remaining NUMERIC,
  p_reason TEXT,
  p_user_id TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_current NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF p_tracked_entity_id IS NOT NULL THEN
    SELECT te."lifeRemaining" INTO v_current
    FROM "trackedEntity" te
    WHERE te."id" = p_tracked_entity_id;
  ELSE
    SELECT t."lifeRemaining" INTO v_current
    FROM "tool" t
    WHERE t."id" = p_tool_readable_id
      AND t."companyId" = p_company_id;
  END IF;

  v_delta := p_new_remaining - COALESCE(v_current, 0);

  RETURN apply_tool_life_delta(
    p_tool_readable_id,
    p_company_id,
    p_tracked_entity_id,
    v_delta,
    'Manual',
    NULL,
    p_reason,
    p_user_id
  );
END;
$$;

SELECT attach_event_trigger('toolLifeLedger', ARRAY[]::TEXT[], ARRAY[]::TEXT[]);

-- Stamp per-serial tool life on receipt / serial creation
CREATE OR REPLACE FUNCTION stamp_tool_life_on_tracked_entity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tool RECORD;
BEGIN
  IF NEW."itemId" IS NULL OR NEW."lifeRemaining" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT t."lifeLimit", t."lifeBasis"
  INTO v_tool
  FROM "item" i
  INNER JOIN "tool" t ON t."id" = i."readableId" AND t."companyId" = i."companyId"
  WHERE i."id" = NEW."itemId"
    AND i."type" = 'Tool'
    AND i."itemTrackingType" = 'Serial'
    AND t."lifeBasis" IS NOT NULL;

  IF FOUND THEN
    NEW."lifeRemaining" := v_tool."lifeLimit";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_tool_life_before_insert ON "trackedEntity";
CREATE TRIGGER stamp_tool_life_before_insert
  BEFORE INSERT ON "trackedEntity"
  FOR EACH ROW
  EXECUTE FUNCTION stamp_tool_life_on_tracked_entity();
