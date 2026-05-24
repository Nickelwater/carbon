-- Extend inbound inspection lots to cover in-house job production output.

CREATE TYPE "inspectionSourceType" AS ENUM ('Receipt', 'Job');

ALTER TABLE "inboundInspection"
  ADD COLUMN "sourceType" "inspectionSourceType" NOT NULL DEFAULT 'Receipt',
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "jobOperationId" TEXT;

ALTER TABLE "inboundInspection"
  ALTER COLUMN "receiptLineId" DROP NOT NULL,
  ALTER COLUMN "receiptId" DROP NOT NULL;

ALTER TABLE "inboundInspection"
  ADD CONSTRAINT "inboundInspection_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "inboundInspection_jobOperationId_fkey"
    FOREIGN KEY ("jobOperationId") REFERENCES "jobOperation"("id") ON DELETE SET NULL;

ALTER TABLE "inboundInspection"
  ADD CONSTRAINT "inboundInspection_source_check" CHECK (
    ("sourceType" = 'Receipt' AND "receiptLineId" IS NOT NULL AND "receiptId" IS NOT NULL)
    OR ("sourceType" = 'Job' AND "jobId" IS NOT NULL)
  );

CREATE INDEX "inboundInspection_jobId_idx" ON "inboundInspection"("jobId");
CREATE INDEX "inboundInspection_sourceType_idx" ON "inboundInspection"("sourceType");

-- Fire-and-forget call to the create-inspection-lot edge function.
CREATE OR REPLACE FUNCTION invoke_create_job_inspection_lot(
  p_job_id TEXT,
  p_company_id TEXT,
  p_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id BIGINT;
  api_url TEXT;
  anon_key TEXT;
BEGIN
  SELECT "apiUrl", "anonKey" INTO api_url, anon_key FROM "config" LIMIT 1;
  IF api_url IS NULL OR anon_key IS NULL THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    api_url || '/functions/v1/create-inspection-lot',
    jsonb_build_object(
      'type', 'job',
      'jobId', p_job_id,
      'companyId', p_company_id,
      'userId', p_user_id
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    )
  ) INTO request_id;
END;
$$;

-- complete_job_to_inventory: hold finished goods when item.requiresInspection.
CREATE OR REPLACE FUNCTION complete_job_to_inventory(
  p_job_id TEXT,
  p_quantity_complete NUMERIC,
  p_storage_unit_id TEXT DEFAULT NULL,
  p_location_id TEXT DEFAULT NULL,
  p_company_id TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id TEXT;
  v_quantity_received_to_inventory NUMERIC;
  v_job_id_readable TEXT;
  v_job_make_method RECORD;
  v_tracked_entity RECORD;
  v_requires_inspection BOOLEAN;
  v_entity_status "trackedEntityStatus";
  v_accounting_enabled BOOLEAN;
  v_company_group_id TEXT;
  v_inventory_account TEXT;
  v_wip_account TEXT;
  v_labor_absorption_account TEXT;
  v_dimension_item_posting_group TEXT;
  v_dimension_location TEXT;
  v_dimension_cost_center TEXT;
  v_dimension_employee TEXT;
  v_event RECORD;
  v_duration_hours NUMERIC;
  v_rate NUMERIC;
  v_labor_cost NUMERIC;
  v_labor_journal_line_reference TEXT;
  v_labor_accounting_period_id TEXT;
  v_labor_journal_entry_id TEXT;
  v_labor_journal_id TEXT;
  v_labor_jl_id TEXT;
  v_accumulated_wip_cost NUMERIC;
  v_today DATE;
  v_journal_line_reference TEXT;
  v_accounting_period_id TEXT;
  v_journal_entry_id TEXT;
  v_journal_id TEXT;
  v_jl_ids TEXT[];
  v_new_per_unit_cost NUMERIC;
  v_costing_method TEXT;
  v_existing_unit_cost NUMERIC;
  v_item_posting_group_id TEXT;
  v_job_location_id TEXT;
  v_total_qty_on_hand NUMERIC;
  v_prior_qty NUMERIC;
  v_prior_value NUMERIC;
  v_new_unit_cost NUMERIC;
  v_bf_item_ids TEXT[] := '{}';
  v_bf_quantities NUMERIC[] := '{}';
  v_bf_storage_unit_ids TEXT[] := '{}';
  v_material RECORD;
  v_material_storage_unit_id TEXT;
  v_material_qty_to_issue NUMERIC;
  v_material_costing_method TEXT;
  v_material_standard_cost NUMERIC;
  v_material_unit_cost NUMERIC;
  v_material_item_posting_group_id TEXT;
  v_material_cogs_total NUMERIC;
  v_cost_layer RECORD;
  v_remaining_to_consume NUMERIC;
  v_layer_unit_cost NUMERIC;
  v_quantity_from_layer NUMERIC;
  v_bf_journal_id TEXT;
  v_bf_journal_entry_id TEXT;
  v_bf_accounting_period_id TEXT;
  v_bf_journal_line_ref TEXT;
  v_bf_jl_id TEXT;
  v_bf_jl_ids TEXT[];
  v_bf_posting_group_ids TEXT[];
BEGIN
  SELECT "itemId", "quantityReceivedToInventory", "jobId", "locationId"
  INTO STRICT v_item_id, v_quantity_received_to_inventory, v_job_id_readable, v_job_location_id
  FROM "job"
  WHERE id = p_job_id;

  v_quantity_received_to_inventory := p_quantity_complete - COALESCE(v_quantity_received_to_inventory, 0);

  SELECT COALESCE(i."requiresInspection", false)
  INTO v_requires_inspection
  FROM "item" i
  WHERE i.id = v_item_id;

  v_entity_status := CASE
    WHEN v_requires_inspection THEN 'On Hold'::"trackedEntityStatus"
    ELSE 'Available'::"trackedEntityStatus"
  END;

  SELECT *
  INTO STRICT v_job_make_method
  FROM "jobMakeMethod"
  WHERE "jobId" = p_job_id
    AND "parentMaterialId" IS NULL;

  UPDATE "job"
  SET status = 'Completed',
      "completedDate" = NOW(),
      "quantityComplete" = p_quantity_complete,
      "quantityReceivedToInventory" = v_quantity_received_to_inventory,
      "updatedAt" = NOW(),
      "updatedBy" = p_user_id
  WHERE id = p_job_id;

  IF v_job_make_method."requiresBatchTracking" THEN
    SELECT *
    INTO v_tracked_entity
    FROM "trackedEntity"
    WHERE attributes->>'Job Make Method' = v_job_make_method.id
      AND status != 'Consumed'
    ORDER BY "createdAt" DESC
    LIMIT 1;

    IF v_tracked_entity.id IS NULL THEN
      RAISE EXCEPTION 'Tracked entity not found';
    END IF;

  INSERT INTO "itemLedger" (
      "entryType", "documentType", "documentId", "companyId",
      "itemId", quantity, "locationId", "storageUnitId",
      "trackedEntityId", "createdBy"
    ) VALUES (
      'Assembly Output', 'Job Receipt', p_job_id, p_company_id,
      v_item_id, v_quantity_received_to_inventory, p_location_id, p_storage_unit_id,
      v_tracked_entity.id, p_user_id
    );

    IF v_requires_inspection THEN
      UPDATE "trackedEntity"
      SET status = v_entity_status
      WHERE id = v_tracked_entity.id;
    END IF;

  ELSIF v_job_make_method."requiresSerialTracking" THEN
    FOR v_tracked_entity IN
      SELECT *
      FROM "trackedEntity"
      WHERE attributes->>'Job Make Method' = v_job_make_method.id
        AND status != 'Consumed'
    LOOP
      INSERT INTO "itemLedger" (
        "entryType", "documentType", "documentId", "companyId",
        "itemId", quantity, "locationId", "storageUnitId",
        "trackedEntityId", "createdBy"
      ) VALUES (
        'Assembly Output', 'Job Receipt', p_job_id, p_company_id,
        v_item_id, 1, p_location_id, p_storage_unit_id,
        v_tracked_entity.id, p_user_id
      );
    END LOOP;

    UPDATE "trackedEntity"
    SET status = v_entity_status
    WHERE attributes->>'Job Make Method' = v_job_make_method.id
      AND status != 'Consumed';

  ELSE
    INSERT INTO "itemLedger" (
      "entryType", "documentType", "documentId", "companyId",
      "itemId", quantity, "locationId", "storageUnitId", "createdBy"
    ) VALUES (
      'Assembly Output', 'Job Receipt', p_job_id, p_company_id,
      v_item_id, v_quantity_received_to_inventory, p_location_id, p_storage_unit_id,
      p_user_id
    );
  END IF;

  IF v_requires_inspection AND v_quantity_received_to_inventory > 0 THEN
    PERFORM invoke_create_job_inspection_lot(p_job_id, p_company_id, p_user_id);
  END IF;

  -- Update pickMethod defaultStorageUnitId if needed
  IF p_storage_unit_id IS NOT NULL AND p_location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "itemLedger"
      WHERE "itemId" = v_item_id
        AND "locationId" = p_location_id
        AND "storageUnitId" IS NOT NULL
        AND "storageUnitId" != p_storage_unit_id
      LIMIT 1
    ) THEN
      IF EXISTS (
        SELECT 1 FROM "pickMethod"
        WHERE "itemId" = v_item_id AND "locationId" = p_location_id
      ) THEN
        UPDATE "pickMethod"
        SET "defaultStorageUnitId" = p_storage_unit_id,
            "updatedBy" = p_user_id,
            "updatedAt" = NOW()
        WHERE "itemId" = v_item_id
          AND "locationId" = p_location_id;
      ELSE
        INSERT INTO "pickMethod" (
          "itemId", "locationId", "defaultStorageUnitId",
          "companyId", "createdBy", "createdAt"
        ) VALUES (
          v_item_id, p_location_id, p_storage_unit_id,
          p_company_id, p_user_id, NOW()
        );
      END IF;
    END IF;
  END IF;

  -- Backflush non-tracked materials
  FOR v_material IN
    SELECT jm.id, jm."itemId", jm."quantityToIssue", jm."quantityIssued",
           jm."storageUnitId", jm."defaultStorageUnit"
    FROM "jobMaterial" jm
    WHERE jm."jobId" = p_job_id
      AND jm."itemType" IN ('Material', 'Part', 'Consumable')
      AND jm."methodType" != 'Make to Order'
      AND jm."requiresBatchTracking" = false
      AND jm."requiresSerialTracking" = false
      AND jm."quantityToIssue" > 0
  LOOP
    v_material_qty_to_issue := v_material."quantityToIssue";

    v_material_storage_unit_id := v_material."storageUnitId";

    IF v_material_storage_unit_id IS NULL AND v_material."defaultStorageUnit" THEN
      SELECT "defaultStorageUnitId" INTO v_material_storage_unit_id
      FROM "pickMethod"
      WHERE "itemId" = v_material."itemId"
        AND "locationId" = v_job_location_id
        AND "companyId" = p_company_id;
    END IF;

    IF v_material_storage_unit_id IS NULL THEN
      SELECT "storageUnitId" INTO v_material_storage_unit_id
      FROM "itemLedger"
      WHERE "itemId" = v_material."itemId"
        AND "locationId" = v_job_location_id
        AND "storageUnitId" IS NOT NULL
      GROUP BY "storageUnitId"
      HAVING SUM(quantity) > 0
      ORDER BY SUM(quantity) DESC
      LIMIT 1;
    END IF;

    INSERT INTO "itemLedger" (
      "entryType", "documentType", "documentId", "companyId",
      "itemId", quantity, "locationId", "storageUnitId", "createdBy"
    ) VALUES (
      'Consumption', 'Job Consumption', p_job_id, p_company_id,
      v_material."itemId", -v_material_qty_to_issue,
      v_job_location_id, v_material_storage_unit_id, p_user_id
    );

    UPDATE "jobMaterial"
    SET "quantityIssued" = COALESCE("quantityIssued", 0) + v_material_qty_to_issue
    WHERE id = v_material.id;

    v_bf_item_ids := v_bf_item_ids || v_material."itemId";
    v_bf_quantities := v_bf_quantities || v_material_qty_to_issue;
    v_bf_storage_unit_ids := v_bf_storage_unit_ids || COALESCE(v_material_storage_unit_id, '');
  END LOOP;

  SELECT "accountingEnabled"
  INTO v_accounting_enabled
  FROM "companySettings"
  WHERE id = p_company_id;

  v_accounting_enabled := COALESCE(v_accounting_enabled, false);

  IF NOT v_accounting_enabled THEN
    RETURN;
  END IF;

  SELECT "companyGroupId"
  INTO STRICT v_company_group_id
  FROM company
  WHERE id = p_company_id;

  SELECT "inventoryAccount", "workInProgressAccount", "laborAbsorptionAccount"
  INTO STRICT v_inventory_account, v_wip_account, v_labor_absorption_account
  FROM "accountDefault"
  WHERE "companyId" = p_company_id;

  SELECT
    MAX(CASE WHEN "entityType" = 'ItemPostingGroup' THEN id END),
    MAX(CASE WHEN "entityType" = 'Location' THEN id END),
    MAX(CASE WHEN "entityType" = 'CostCenter' THEN id END),
    MAX(CASE WHEN "entityType" = 'Employee' THEN id END)
  INTO v_dimension_item_posting_group, v_dimension_location,
       v_dimension_cost_center, v_dimension_employee
  FROM dimension
  WHERE "companyGroupId" = v_company_group_id
    AND active = true
    AND "entityType" IN ('ItemPostingGroup', 'Location', 'CostCenter', 'Employee');

  FOR v_event IN
    SELECT
      pe.id,
      pe.duration,
      pe.type,
      pe."employeeId",
      wc."laborRate",
      wc."machineRate"
    FROM "productionEvent" pe
    INNER JOIN "jobOperation" jo ON jo.id = pe."jobOperationId"
    INNER JOIN "workCenter" wc ON wc.id = pe."workCenterId"
    WHERE jo."jobId" = p_job_id
      AND pe."endTime" IS NOT NULL
      AND pe."postedToGL" = false
      AND pe.duration > 0
  LOOP
    v_duration_hours := v_event.duration::NUMERIC / 3600;
    v_rate := CASE
      WHEN v_event.type = 'Machine' THEN COALESCE(v_event."machineRate", 0)
      ELSE COALESCE(v_event."laborRate", 0)
    END;
    v_labor_cost := v_duration_hours * v_rate;

    IF v_labor_cost > 0 AND v_labor_absorption_account IS NOT NULL THEN
      v_labor_journal_line_reference := nanoid();

      SELECT id INTO v_labor_accounting_period_id
      FROM "accountingPeriod"
      WHERE "companyId" = p_company_id
        AND "startDate" <= CURRENT_DATE
        AND "endDate" >= CURRENT_DATE
        AND status = 'Active'
      LIMIT 1;

      IF v_labor_accounting_period_id IS NULL THEN
        UPDATE "accountingPeriod"
        SET status = 'Inactive'
        WHERE status = 'Active' AND "companyId" = p_company_id;

        UPDATE "accountingPeriod"
        SET status = 'Active'
        WHERE "companyId" = p_company_id
          AND "startDate" <= CURRENT_DATE
          AND "endDate" >= CURRENT_DATE
        RETURNING id INTO v_labor_accounting_period_id;

        IF v_labor_accounting_period_id IS NULL THEN
          INSERT INTO "accountingPeriod" (
            "startDate", "endDate", "companyId", status, "createdBy"
          ) VALUES (
            date_trunc('month', CURRENT_DATE)::DATE,
            (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
            p_company_id, 'Active', 'system'
          )
          RETURNING id INTO v_labor_accounting_period_id;
        END IF;
      END IF;

      v_labor_journal_entry_id := get_next_sequence('journalEntry', p_company_id);

      INSERT INTO journal (
        "journalEntryId", "accountingPeriodId", description,
        "postingDate", "companyId", "sourceType", status,
        "postedAt", "postedBy", "createdBy"
      ) VALUES (
        v_labor_journal_entry_id, v_labor_accounting_period_id,
        v_event.type || ' Time — Job ' || v_job_id_readable,
        CURRENT_DATE, p_company_id, 'Production Event', 'Posted',
        NOW(), p_user_id, p_user_id
      )
      RETURNING id INTO v_labor_journal_id;

      INSERT INTO "journalLine" (
        "journalId", "accountId", description, amount, quantity,
        "documentType", "documentId", "documentLineReference",
        "journalLineReference", "companyId"
      ) VALUES (
        v_labor_journal_id, v_wip_account, 'WIP Account',
        v_labor_cost, 1,
        'Production Event', p_job_id, 'job:' || p_job_id,
        v_labor_journal_line_reference, p_company_id
      )
      RETURNING id INTO v_labor_jl_id;

      IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
        INSERT INTO "journalLineDimension" (
          "journalLineId", "dimensionId", "valueId", "companyId"
        ) VALUES (
          v_labor_jl_id, v_dimension_employee, v_event."employeeId", p_company_id
        );
      END IF;

      INSERT INTO "journalLine" (
        "journalId", "accountId", description, amount, quantity,
        "documentType", "documentId", "documentLineReference",
        "journalLineReference", "companyId"
      ) VALUES (
        v_labor_journal_id, v_labor_absorption_account, 'Labor/Machine Absorption',
        -v_labor_cost, 1,
        'Production Event', p_job_id, 'job:' || p_job_id,
        v_labor_journal_line_reference, p_company_id
      )
      RETURNING id INTO v_labor_jl_id;

      IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
        INSERT INTO "journalLineDimension" (
          "journalLineId", "dimensionId", "valueId", "companyId"
        ) VALUES (
          v_labor_jl_id, v_dimension_employee, v_event."employeeId", p_company_id
        );
      END IF;
    END IF;

    UPDATE "productionEvent"
    SET "postedToGL" = true
    WHERE id = v_event.id;
  END LOOP;

  IF array_length(v_bf_item_ids, 1) IS NOT NULL AND array_length(v_bf_item_ids, 1) > 0 THEN
    SELECT id INTO v_bf_accounting_period_id
    FROM "accountingPeriod"
    WHERE "companyId" = p_company_id
      AND "startDate" <= CURRENT_DATE
      AND "endDate" >= CURRENT_DATE
      AND status = 'Active'
    LIMIT 1;

    IF v_bf_accounting_period_id IS NULL THEN
      UPDATE "accountingPeriod"
      SET status = 'Inactive'
      WHERE status = 'Active' AND "companyId" = p_company_id;

      UPDATE "accountingPeriod"
      SET status = 'Active'
      WHERE "companyId" = p_company_id
        AND "startDate" <= CURRENT_DATE
        AND "endDate" >= CURRENT_DATE
      RETURNING id INTO v_bf_accounting_period_id;

      IF v_bf_accounting_period_id IS NULL THEN
        INSERT INTO "accountingPeriod" (
          "startDate", "endDate", "companyId", status, "createdBy"
        ) VALUES (
          date_trunc('month', CURRENT_DATE)::DATE,
          (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
          p_company_id, 'Active', 'system'
        )
        RETURNING id INTO v_bf_accounting_period_id;
      END IF;
    END IF;

    v_bf_journal_entry_id := get_next_sequence('journalEntry', p_company_id);

    INSERT INTO journal (
      "journalEntryId", "accountingPeriodId", description,
      "postingDate", "companyId", "sourceType", status,
      "postedAt", "postedBy", "createdBy"
    ) VALUES (
      v_bf_journal_entry_id, v_bf_accounting_period_id,
      'Material Issue — Job ' || v_job_id_readable,
      CURRENT_DATE, p_company_id, 'Job Consumption', 'Posted',
      NOW(), p_user_id, p_user_id
    )
    RETURNING id INTO v_bf_journal_id;

    v_bf_jl_ids := '{}';
    v_bf_posting_group_ids := '{}';

    FOR i IN 1..array_length(v_bf_item_ids, 1)
    LOOP
      SELECT "costingMethod", "standardCost", "unitCost", "itemPostingGroupId"
      INTO v_material_costing_method, v_material_standard_cost, v_material_unit_cost, v_material_item_posting_group_id
      FROM "itemCost"
      WHERE "itemId" = v_bf_item_ids[i]
        AND "companyId" = p_company_id;

      IF v_material_costing_method IS NULL THEN
        CONTINUE;
      END IF;

      v_material_cogs_total := 0;

      IF v_material_costing_method = 'Standard' THEN
        v_material_cogs_total := COALESCE(v_material_standard_cost, 0) * v_bf_quantities[i];

      ELSIF v_material_costing_method = 'Average' THEN
        v_material_cogs_total := COALESCE(v_material_unit_cost, 0) * v_bf_quantities[i];

      ELSIF v_material_costing_method IN ('FIFO', 'LIFO') THEN
        v_remaining_to_consume := v_bf_quantities[i];

        FOR v_cost_layer IN
          SELECT id, quantity, cost, "remainingQuantity"
          FROM "costLedger"
          WHERE "itemId" = v_bf_item_ids[i]
            AND "companyId" = p_company_id
            AND "remainingQuantity" > 0
          ORDER BY
            CASE WHEN v_material_costing_method = 'FIFO' THEN "postingDate" END ASC,
            CASE WHEN v_material_costing_method = 'LIFO' THEN "postingDate" END DESC,
            CASE WHEN v_material_costing_method = 'FIFO' THEN "createdAt" END ASC,
            CASE WHEN v_material_costing_method = 'LIFO' THEN "createdAt" END DESC
        LOOP
          EXIT WHEN v_remaining_to_consume <= 0;

          v_layer_unit_cost := CASE
            WHEN v_cost_layer.quantity > 0 THEN v_cost_layer.cost / v_cost_layer.quantity
            ELSE 0
          END;

          v_quantity_from_layer := LEAST(v_remaining_to_consume, v_cost_layer."remainingQuantity");
          v_material_cogs_total := v_material_cogs_total + v_quantity_from_layer * v_layer_unit_cost;
          v_remaining_to_consume := v_remaining_to_consume - v_quantity_from_layer;

          UPDATE "costLedger"
          SET "remainingQuantity" = "remainingQuantity" - v_quantity_from_layer
          WHERE id = v_cost_layer.id;
        END LOOP;

        IF v_remaining_to_consume > 0 THEN
          v_material_cogs_total := v_material_cogs_total + v_remaining_to_consume * COALESCE(v_material_unit_cost, 0);
        END IF;
      END IF;

      IF v_material_cogs_total <= 0 THEN
        CONTINUE;
      END IF;

      v_bf_journal_line_ref := nanoid();

      INSERT INTO "journalLine" (
        "journalId", "accountId", description, amount, quantity,
        "documentType", "documentId", "documentLineReference",
        "journalLineReference", "companyId"
      ) VALUES (
        v_bf_journal_id, v_wip_account, 'WIP Account',
        v_material_cogs_total, v_bf_quantities[i],
        'Job Consumption', p_job_id, 'job:' || p_job_id,
        v_bf_journal_line_ref, p_company_id
      )
      RETURNING id INTO v_bf_jl_id;

      v_bf_jl_ids := v_bf_jl_ids || v_bf_jl_id;
      v_bf_posting_group_ids := v_bf_posting_group_ids || COALESCE(v_material_item_posting_group_id, '');

      INSERT INTO "journalLine" (
        "journalId", "accountId", description, amount, quantity,
        "documentType", "documentId", "documentLineReference",
        "journalLineReference", "companyId"
      ) VALUES (
        v_bf_journal_id, v_inventory_account, 'Inventory Account',
        -v_material_cogs_total, v_bf_quantities[i],
        'Job Consumption', p_job_id, 'job:' || p_job_id,
        v_bf_journal_line_ref, p_company_id
      )
      RETURNING id INTO v_bf_jl_id;

      v_bf_jl_ids := v_bf_jl_ids || v_bf_jl_id;
      v_bf_posting_group_ids := v_bf_posting_group_ids || COALESCE(v_material_item_posting_group_id, '');

      INSERT INTO "costLedger" (
        "itemLedgerType", "costLedgerType", adjustment,
        "documentType", "documentId", "itemId",
        quantity, cost, "remainingQuantity", "companyId"
      ) VALUES (
        'Consumption', 'Direct Cost', false,
        'Job Consumption', p_job_id, v_bf_item_ids[i],
        -v_bf_quantities[i], -v_material_cogs_total,
        0, p_company_id
      );
    END LOOP;

    IF array_length(v_bf_jl_ids, 1) IS NOT NULL THEN
      FOR i IN 1..array_length(v_bf_jl_ids, 1)
      LOOP
        IF v_bf_posting_group_ids[i] != '' AND v_dimension_item_posting_group IS NOT NULL THEN
          INSERT INTO "journalLineDimension" (
            "journalLineId", "dimensionId", "valueId", "companyId"
          ) VALUES (
            v_bf_jl_ids[i], v_dimension_item_posting_group, v_bf_posting_group_ids[i], p_company_id
          );
        END IF;

        IF v_job_location_id IS NOT NULL AND v_dimension_location IS NOT NULL THEN
          INSERT INTO "journalLineDimension" (
            "journalLineId", "dimensionId", "valueId", "companyId"
          ) VALUES (
            v_bf_jl_ids[i], v_dimension_location, v_job_location_id, p_company_id
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  SELECT COALESCE(ABS(SUM(jl.amount)), 0)
  INTO v_accumulated_wip_cost
  FROM "journalLine" jl
  INNER JOIN journal j ON j.id = jl."journalId"
  WHERE jl."accountId" = v_wip_account
    AND jl."documentId" = p_job_id
    AND j."companyId" = p_company_id;

  IF v_accumulated_wip_cost <= 0 THEN
    RETURN;
  END IF;

  v_today := CURRENT_DATE;
  v_journal_line_reference := nanoid();

  SELECT id INTO v_accounting_period_id
  FROM "accountingPeriod"
  WHERE "companyId" = p_company_id
    AND "startDate" <= v_today
    AND "endDate" >= v_today
    AND status = 'Active'
  LIMIT 1;

  IF v_accounting_period_id IS NULL THEN
    UPDATE "accountingPeriod"
    SET status = 'Inactive'
    WHERE status = 'Active' AND "companyId" = p_company_id;

    UPDATE "accountingPeriod"
    SET status = 'Active'
    WHERE "companyId" = p_company_id
      AND "startDate" <= v_today
      AND "endDate" >= v_today
    RETURNING id INTO v_accounting_period_id;

    IF v_accounting_period_id IS NULL THEN
      INSERT INTO "accountingPeriod" (
        "startDate", "endDate", "companyId", status, "createdBy"
      ) VALUES (
        date_trunc('month', v_today)::DATE,
        (date_trunc('month', v_today) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
        p_company_id, 'Active', 'system'
      )
      RETURNING id INTO v_accounting_period_id;
    END IF;
  END IF;

  v_journal_entry_id := get_next_sequence('journalEntry', p_company_id);

  INSERT INTO journal (
    "journalEntryId", "accountingPeriodId", description,
    "postingDate", "companyId", "sourceType", status,
    "postedAt", "postedBy", "createdBy"
  ) VALUES (
    v_journal_entry_id, v_accounting_period_id,
    'Job Completion ' || v_job_id_readable,
    v_today, p_company_id, 'Job Receipt', 'Posted',
    NOW(), p_user_id, p_user_id
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO "journalLine" (
    "journalId", "accountId", description, amount, quantity,
    "documentType", "documentId", "documentLineReference",
    "journalLineReference", "companyId"
  ) VALUES (
    v_journal_id, v_inventory_account, 'Finished Goods Inventory',
    v_accumulated_wip_cost, v_quantity_received_to_inventory,
    'Job Receipt', p_job_id, 'job:' || p_job_id,
    v_journal_line_reference, p_company_id
  )
  RETURNING id INTO v_labor_jl_id;

  v_jl_ids := ARRAY[v_labor_jl_id];

  INSERT INTO "journalLine" (
    "journalId", "accountId", description, amount, quantity,
    "documentType", "documentId", "documentLineReference",
    "journalLineReference", "companyId"
  ) VALUES (
    v_journal_id, v_wip_account, 'WIP Account',
    -v_accumulated_wip_cost, v_quantity_received_to_inventory,
    'Job Receipt', p_job_id, 'job:' || p_job_id,
    v_journal_line_reference, p_company_id
  )
  RETURNING id INTO v_labor_jl_id;

  v_jl_ids := v_jl_ids || v_labor_jl_id;

  INSERT INTO "costLedger" (
    "itemLedgerType", "costLedgerType", adjustment,
    "documentType", "documentId", "itemId",
    quantity, cost, "remainingQuantity", "companyId"
  ) VALUES (
    'Output', 'Direct Cost', false,
    'Job Receipt', p_job_id, v_item_id,
    v_quantity_received_to_inventory, v_accumulated_wip_cost,
    v_quantity_received_to_inventory, p_company_id
  );

  SELECT "costingMethod", "unitCost", "itemPostingGroupId"
  INTO v_costing_method, v_existing_unit_cost, v_item_posting_group_id
  FROM "itemCost"
  WHERE "itemId" = v_item_id
    AND "companyId" = p_company_id;

  v_new_per_unit_cost := v_accumulated_wip_cost / v_quantity_received_to_inventory;

  IF v_costing_method = 'Average' THEN
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_qty_on_hand
    FROM "itemLedger"
    WHERE "itemId" = v_item_id
      AND "companyId" = p_company_id;

    v_prior_qty := v_total_qty_on_hand - v_quantity_received_to_inventory;
    v_prior_value := v_prior_qty * COALESCE(v_existing_unit_cost, 0);

    IF v_total_qty_on_hand > 0 THEN
      v_new_unit_cost := (v_prior_value + v_accumulated_wip_cost) / v_total_qty_on_hand;
      UPDATE "itemCost"
      SET "unitCost" = v_new_unit_cost
      WHERE "itemId" = v_item_id
        AND "companyId" = p_company_id;
    END IF;

  ELSIF v_costing_method IN ('FIFO', 'LIFO') THEN
    UPDATE "itemCost"
    SET "unitCost" = v_new_per_unit_cost
    WHERE "itemId" = v_item_id
      AND "companyId" = p_company_id;
  END IF;

  IF v_jl_ids IS NOT NULL AND array_length(v_jl_ids, 1) > 0 THEN
    FOR i IN 1..array_length(v_jl_ids, 1)
    LOOP
      IF v_item_posting_group_id IS NOT NULL AND v_dimension_item_posting_group IS NOT NULL THEN
        INSERT INTO "journalLineDimension" (
          "journalLineId", "dimensionId", "valueId", "companyId"
        ) VALUES (
          v_jl_ids[i], v_dimension_item_posting_group, v_item_posting_group_id, p_company_id
        );
      END IF;

      IF v_job_location_id IS NOT NULL AND v_dimension_location IS NOT NULL THEN
        INSERT INTO "journalLineDimension" (
          "journalLineId", "dimensionId", "valueId", "companyId"
        ) VALUES (
          v_jl_ids[i], v_dimension_location, v_job_location_id, p_company_id
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;
