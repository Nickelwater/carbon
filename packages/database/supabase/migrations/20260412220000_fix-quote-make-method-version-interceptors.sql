-- sync_* make-method interceptors: COALESCE(version, 0) when activeMakeMethods has no row,
-- and restore quotePartId root quoteMakeMethod inserts (regression vs legacy triggers).

CREATE OR REPLACE FUNCTION sync_insert_quote_line_make_method(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'INSERT' THEN RETURN; END IF;
  IF (p_new->>'methodType') != 'Make to Order' THEN RETURN; END IF;

  IF (p_new->>'quotePartId') IS NOT NULL AND (p_new->>'itemId') IS NULL THEN
    INSERT INTO "quoteMakeMethod" (
      "quoteId", "quoteLineId", "quotePartId", "companyId", "createdAt", "createdBy", "version"
    ) VALUES (
      p_new->>'quoteId', p_new->>'id', p_new->>'quotePartId',
      p_new->>'companyId', NOW(), p_new->>'createdBy', 0
    );
    RETURN;
  END IF;

  IF (p_new->>'itemId') IS NULL THEN RETURN; END IF;

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  INSERT INTO "quoteMakeMethod" (
    "quoteId", "quoteLineId", "itemId", "companyId", "createdAt", "createdBy", "version"
  ) VALUES (
    p_new->>'quoteId', p_new->>'id', p_new->>'itemId',
    p_new->>'companyId', NOW(), p_new->>'createdBy', COALESCE(v_version, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_update_quote_line_make_method_item_id(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'UPDATE' THEN RETURN; END IF;
  IF (p_new->>'methodType') != 'Make to Order' THEN RETURN; END IF;

  IF (p_new->>'quotePartId') IS NOT NULL AND (p_new->>'itemId') IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "quoteMakeMethod"
      WHERE "quoteLineId" = p_new->>'id' AND "parentMaterialId" IS NULL
    ) THEN
      INSERT INTO "quoteMakeMethod" (
        "quoteId", "quoteLineId", "quotePartId", "companyId", "createdAt", "createdBy", "version"
      ) VALUES (
        p_new->>'quoteId', p_new->>'id', p_new->>'quotePartId',
        p_new->>'companyId', NOW(), p_new->>'createdBy', 0
      );
    ELSE
      UPDATE "quoteMakeMethod"
      SET "quotePartId" = p_new->>'quotePartId', "itemId" = NULL, "version" = 0
      WHERE "quoteLineId" = p_new->>'id' AND "parentMaterialId" IS NULL;
    END IF;
    RETURN;
  END IF;

  IF (p_new->>'itemId') IS NULL THEN RETURN; END IF;

  IF NOT (
    ((p_old->>'methodType') = 'Make to Order' AND (p_old->>'itemId') IS DISTINCT FROM (p_new->>'itemId'))
    OR ((p_new->>'methodType') = 'Make to Order' AND (p_old->>'methodType') != 'Make to Order')
    OR ((p_old->>'quotePartId') IS DISTINCT FROM (p_new->>'quotePartId') AND (p_new->>'itemId') IS NOT NULL)
  ) THEN
    RETURN;
  END IF;

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  IF NOT EXISTS (
    SELECT 1 FROM "quoteMakeMethod"
    WHERE "quoteLineId" = p_new->>'id' AND "parentMaterialId" IS NULL
  ) THEN
    INSERT INTO "quoteMakeMethod" (
      "quoteId", "quoteLineId", "itemId", "companyId", "createdAt", "createdBy", "version"
    ) VALUES (
      p_new->>'quoteId', p_new->>'id', p_new->>'itemId',
      p_new->>'companyId', NOW(), p_new->>'createdBy', COALESCE(v_version, 0)
    );
  ELSE
    UPDATE "quoteMakeMethod"
    SET "itemId" = p_new->>'itemId',
        "quotePartId" = NULL,
        "version" = COALESCE(v_version, 0)
    WHERE "quoteLineId" = p_new->>'id' AND "parentMaterialId" IS NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_insert_quote_material_make_method(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'INSERT' THEN RETURN; END IF;
  IF (p_new->>'methodType') != 'Make to Order' THEN RETURN; END IF;
  IF (p_new->>'itemId') IS NULL THEN RETURN; END IF;

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  INSERT INTO "quoteMakeMethod" (
    "quoteId", "quoteLineId", "parentMaterialId", "itemId", "companyId", "createdAt", "createdBy", "version"
  ) VALUES (
    p_new->>'quoteId', p_new->>'quoteLineId', p_new->>'id', p_new->>'itemId',
    p_new->>'companyId', NOW(), p_new->>'createdBy', COALESCE(v_version, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_update_quote_material_make_method_item_id(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'UPDATE' THEN RETURN; END IF;

  IF NOT (
    ((p_old->>'methodType') = 'Make to Order' AND (p_old->>'itemId') IS DISTINCT FROM (p_new->>'itemId'))
    OR ((p_new->>'methodType') = 'Make to Order' AND (p_old->>'methodType') != 'Make to Order')
  ) THEN
    RETURN;
  END IF;

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  IF NOT EXISTS (
    SELECT 1 FROM "quoteMakeMethod"
    WHERE "quoteLineId" = p_new->>'quoteLineId' AND "parentMaterialId" = p_new->>'id'
  ) THEN
    INSERT INTO "quoteMakeMethod" (
      "quoteId", "quoteLineId", "parentMaterialId", "itemId", "companyId", "createdAt", "createdBy", "version"
    ) VALUES (
      p_new->>'quoteId', p_new->>'quoteLineId', p_new->>'id', p_new->>'itemId',
      p_new->>'companyId', NOW(), p_new->>'createdBy', COALESCE(v_version, 0)
    );
  ELSE
    UPDATE "quoteMakeMethod"
    SET "itemId" = p_new->>'itemId',
        "version" = COALESCE(v_version, 0)
    WHERE "quoteLineId" = p_new->>'quoteLineId' AND "parentMaterialId" = p_new->>'id';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_insert_job_material_make_method(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_readable_id TEXT;
  v_item_tracking_type TEXT;
  v_job_make_method_id TEXT;
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'INSERT' THEN RETURN; END IF;
  IF (p_new->>'methodType') != 'Make to Order' THEN RETURN; END IF;
  IF (p_new->>'itemId') IS NULL THEN RETURN; END IF;

  SELECT "readableIdWithRevision", "itemTrackingType"
    INTO v_item_readable_id, v_item_tracking_type
  FROM "item"
  WHERE "id" = p_new->>'itemId';

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  INSERT INTO "jobMakeMethod" (
    "jobId", "parentMaterialId", "itemId", "companyId", "createdBy",
    "requiresSerialTracking", "requiresBatchTracking", "version"
  ) VALUES (
    p_new->>'jobId', p_new->>'id', p_new->>'itemId', p_new->>'companyId', p_new->>'createdBy',
    v_item_tracking_type = 'Serial', v_item_tracking_type = 'Batch', COALESCE(v_version, 0)
  )
  RETURNING "id" INTO v_job_make_method_id;

  INSERT INTO "trackedEntity" (
    "sourceDocument", "sourceDocumentId", "sourceDocumentReadableId",
    "quantity", "status", "companyId", "createdBy", "attributes"
  ) VALUES (
    'Item', p_new->>'itemId', v_item_readable_id,
    (p_new->>'quantity')::numeric, 'Reserved',
    p_new->>'companyId', p_new->>'createdBy',
    jsonb_build_object('Job', p_new->>'jobId', 'Job Make Method', v_job_make_method_id, 'Job Material', p_new->>'id')
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_update_job_material_make_method_item_id(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_readable_id TEXT;
  v_item_tracking_type TEXT;
  v_job_make_method_id TEXT;
  v_version NUMERIC(10, 2);
BEGIN
  IF p_operation != 'UPDATE' THEN RETURN; END IF;

  IF NOT (
    ((p_old->>'methodType') = 'Make to Order' AND (p_old->>'itemId') IS DISTINCT FROM (p_new->>'itemId'))
    OR ((p_new->>'methodType') = 'Make to Order' AND (p_old->>'methodType') != 'Make to Order')
  ) THEN
    RETURN;
  END IF;

  SELECT "readableIdWithRevision", "itemTrackingType"
    INTO v_item_readable_id, v_item_tracking_type
  FROM "item"
  WHERE "id" = p_new->>'itemId';

  SELECT "version" INTO v_version FROM "activeMakeMethods" WHERE "itemId" = p_new->>'itemId';

  IF NOT EXISTS (
    SELECT 1 FROM "jobMakeMethod"
    WHERE "jobId" = p_new->>'jobId' AND "parentMaterialId" = p_new->>'id'
  ) THEN
    INSERT INTO "jobMakeMethod" (
      "jobId", "parentMaterialId", "itemId", "companyId", "createdBy",
      "requiresSerialTracking", "requiresBatchTracking", "version"
    ) VALUES (
      p_new->>'jobId', p_new->>'id', p_new->>'itemId', p_new->>'companyId', p_new->>'createdBy',
      v_item_tracking_type = 'Serial', v_item_tracking_type = 'Batch', COALESCE(v_version, 0)
    )
    RETURNING "id" INTO v_job_make_method_id;

    INSERT INTO "trackedEntity" (
      "sourceDocument", "sourceDocumentId", "sourceDocumentReadableId",
      "quantity", "status", "companyId", "createdBy", "attributes"
    ) VALUES (
      'Item', p_new->>'itemId', v_item_readable_id,
      (p_new->>'quantity')::numeric, 'Reserved',
      p_new->>'companyId', p_new->>'createdBy',
      jsonb_build_object('Job', p_new->>'jobId', 'Job Make Method', v_job_make_method_id, 'Job Material', p_new->>'id')
    );
  ELSE
    UPDATE "jobMakeMethod"
    SET "itemId" = p_new->>'itemId',
        "requiresSerialTracking" = (v_item_tracking_type = 'Serial'),
        "requiresBatchTracking" = (v_item_tracking_type = 'Batch'),
        "version" = COALESCE(v_version, 0)
    WHERE "jobId" = p_new->>'jobId' AND "parentMaterialId" = p_new->>'id'
    RETURNING "id" INTO v_job_make_method_id;

    INSERT INTO "trackedEntity" (
      "sourceDocument", "sourceDocumentId", "sourceDocumentReadableId",
      "quantity", "status", "companyId", "createdBy", "attributes"
    ) VALUES (
      'Item', p_new->>'itemId', v_item_readable_id,
      (p_new->>'quantity')::numeric, 'Reserved',
      p_new->>'companyId', p_new->>'createdBy',
      jsonb_build_object('Job', p_new->>'jobId', 'Job Make Method', v_job_make_method_id, 'Job Material', p_new->>'id')
    );
  END IF;
END;
$$;
