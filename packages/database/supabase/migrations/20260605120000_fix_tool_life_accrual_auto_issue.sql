-- Ensure permanent tools are auto-issued before life accrual.
-- MES normally starts operations via production events (event.tsx), not start.$operationId.

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
  -- Auto-issue permanent tools that are not yet issued (non-serial, or single serial).
  PERFORM auto_issue_permanent_job_operation_tools(p_job_operation_id, p_user_id);

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
