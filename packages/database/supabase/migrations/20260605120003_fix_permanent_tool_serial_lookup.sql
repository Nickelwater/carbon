-- Permanent serial tools: match serials by tool readableId (all revisions),
-- and require manual issue instead of blocking operation start when none found.

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
