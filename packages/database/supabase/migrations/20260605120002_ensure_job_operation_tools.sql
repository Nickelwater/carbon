-- Sync missing job operation tools from the snapshotted manufacturing method
-- before auto-issue and life accrual.

CREATE OR REPLACE FUNCTION ensure_job_operation_tools_from_method(
  p_job_operation_id TEXT,
  p_user_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO "jobOperationTool" (
    "toolId",
    "quantity",
    "operationId",
    "companyId",
    "createdBy"
  )
  SELECT
    mot."toolId",
    mot."quantity",
    jo."id",
    jo."companyId",
    p_user_id
  FROM "jobOperation" jo
  INNER JOIN "jobMakeMethod" jmm
    ON jmm."id" = jo."jobMakeMethodId"
  INNER JOIN "makeMethod" mm
    ON mm."itemId" = jmm."itemId"
    AND mm."version" = jmm."version"
    AND mm."companyId" = jo."companyId"
  INNER JOIN "methodOperation" mo
    ON mo."makeMethodId" = mm."id"
    AND mo."order" = jo."order"
  INNER JOIN "methodOperationTool" mot
    ON mot."operationId" = mo."id"
  WHERE jo."id" = p_job_operation_id
    AND NOT EXISTS (
      SELECT 1
      FROM "jobOperationTool" existing
      WHERE existing."operationId" = jo."id"
        AND existing."toolId" = mot."toolId"
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    INSERT INTO "jobOperationTool" (
      "toolId",
      "quantity",
      "operationId",
      "companyId",
      "createdBy"
    )
    SELECT
      mot."toolId",
      mot."quantity",
      jo."id",
      jo."companyId",
      p_user_id
    FROM "jobOperation" jo
    INNER JOIN "jobMakeMethod" jmm
      ON jmm."id" = jo."jobMakeMethodId"
    INNER JOIN "activeMakeMethods" amm
      ON amm."itemId" = jmm."itemId"
      AND amm."companyId" = jo."companyId"
    INNER JOIN "methodOperation" mo
      ON mo."makeMethodId" = amm."id"
      AND mo."order" = jo."order"
    INNER JOIN "methodOperationTool" mot
      ON mot."operationId" = mo."id"
    WHERE jo."id" = p_job_operation_id
      AND NOT EXISTS (
        SELECT 1
        FROM "jobOperationTool" existing
        WHERE existing."operationId" = jo."id"
          AND existing."toolId" = mot."toolId"
      );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$$;

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
  PERFORM ensure_job_operation_tools_from_method(p_job_operation_id, p_user_id);

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
      -- Match serials across all revisions of the tool (readableId), not one item id.
      SELECT COUNT(*), MIN(te."id")
      INTO v_active_serial_count, v_single_serial_id
      FROM "trackedEntity" te
      INNER JOIN "item" tei ON tei."id" = te."itemId"
      WHERE tei."readableId" = v_row.tool_readable_id
        AND te."companyId" = v_row."companyId"
        AND te."status" IN ('Available', 'Reserved');

      IF v_active_serial_count = 0 THEN
        v_requires_selection := v_requires_selection || jsonb_build_array(
          jsonb_build_object(
            'jobOperationToolId', v_row.job_operation_tool_id,
            'toolId', v_row."toolId",
            'message', format(
              'No available serial for permanent tool %s. Receive a serial to inventory or issue the tool manually.',
              v_row.tool_readable_id
            )
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
            'toolId', v_row."toolId",
            'message', format(
              'Select which serial to use for permanent tool %s.',
              v_row.tool_readable_id
            )
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

DROP FUNCTION IF EXISTS accrue_tool_life_for_operation(TEXT, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION accrue_tool_life_for_operation(
  p_job_operation_id TEXT,
  p_quantity_parts NUMERIC,
  p_event_type TEXT,
  p_user_id TEXT
)
RETURNS INTEGER
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
  v_accrual_count INTEGER := 0;
BEGIN
  PERFORM ensure_job_operation_tools_from_method(p_job_operation_id, p_user_id);
  PERFORM auto_issue_permanent_job_operation_tools(p_job_operation_id, p_user_id);

  SELECT
    jo."companyId",
    jo."partsPerCycle",
    jo."machineTime"
  INTO v_op
  FROM "jobOperation" jo
  WHERE jo."id" = p_job_operation_id;

  IF NOT FOUND THEN
    RETURN 0;
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
      v_accrual_count := v_accrual_count + 1;
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
      v_accrual_count := v_accrual_count + 1;
    END IF;
  END LOOP;

  RETURN v_accrual_count;
END;
$$;
