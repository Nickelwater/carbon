-- Inspection document versioning: Draft / Active / Archived with documentFamilyId lineage

DO $$ BEGIN
  CREATE TYPE "inspectionDocumentStatus" AS ENUM (
    'Draft',
    'Active',
    'Archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "approvalDocumentType" ADD VALUE IF NOT EXISTS 'inspectionDocument';

ALTER TABLE "inspectionDocument"
  ADD COLUMN IF NOT EXISTS "status" "inspectionDocumentStatus" NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS "documentFamilyId" TEXT;

-- Backfill existing rows before NOT NULL constraint
UPDATE "inspectionDocument"
SET
  "documentFamilyId" = "id",
  "status" = 'Active'::"inspectionDocumentStatus",
  "version" = GREATEST("version", 1)
WHERE "documentFamilyId" IS NULL;

ALTER TABLE "inspectionDocument"
  ALTER COLUMN "documentFamilyId" SET NOT NULL;

-- View selects d1.* including version; drop before altering column type
DROP VIEW IF EXISTS "inspectionDocuments";

-- Change version to NUMERIC to match quality documents
ALTER TABLE "inspectionDocument"
  ALTER COLUMN "version" TYPE NUMERIC USING "version"::NUMERIC,
  ALTER COLUMN "version" SET DEFAULT 1;

ALTER TABLE "inspectionDocument"
  DROP CONSTRAINT IF EXISTS "inspectionDocument_version_check";

ALTER TABLE "inspectionDocument"
  ADD CONSTRAINT "inspectionDocument_version_check" CHECK ("version" >= 0);

ALTER TABLE "inspectionDocument"
  DROP CONSTRAINT IF EXISTS "inspectionDocument_version_unique";

ALTER TABLE "inspectionDocument"
  ADD CONSTRAINT "inspectionDocument_version_unique"
    UNIQUE ("documentFamilyId", "companyId", "version");

CREATE INDEX IF NOT EXISTS "inspectionDocument_documentFamilyId_companyId_idx"
  ON "inspectionDocument" ("documentFamilyId", "companyId");

CREATE INDEX IF NOT EXISTS "inspectionDocument_documentFamilyId_companyId_status_idx"
  ON "inspectionDocument" ("documentFamilyId", "companyId", "status");

-- Set documentFamilyId to id for first version when not copying from another version
CREATE OR REPLACE FUNCTION set_inspection_document_family_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."documentFamilyId" IS NULL THEN
    NEW."documentFamilyId" := NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_inspection_document_family_id ON "inspectionDocument";

CREATE TRIGGER trigger_set_inspection_document_family_id
  BEFORE INSERT ON "inspectionDocument"
  FOR EACH ROW
  EXECUTE FUNCTION set_inspection_document_family_id();

-- Archive other active versions in the same family when one becomes Active
CREATE OR REPLACE FUNCTION archive_other_inspection_documents()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Active' AND (OLD.status IS NULL OR OLD.status != 'Active') THEN
    UPDATE "inspectionDocument"
    SET status = 'Archived'
    WHERE "documentFamilyId" = NEW."documentFamilyId"
      AND "companyId" = NEW."companyId"
      AND id != NEW.id
      AND status = 'Active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_archive_other_inspection_documents ON "inspectionDocument";

CREATE TRIGGER trigger_archive_other_inspection_documents
  AFTER UPDATE OF status ON "inspectionDocument"
  FOR EACH ROW
  EXECUTE FUNCTION archive_other_inspection_documents();

-- Event system interceptor (mirrors qualityDocument)
CREATE OR REPLACE FUNCTION sync_archive_other_inspection_documents(
  p_table TEXT, p_operation TEXT, p_new JSONB, p_old JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_operation != 'UPDATE' THEN RETURN; END IF;
  IF NOT ((p_new->>'status') = 'Active' AND ((p_old->>'status') IS NULL OR (p_old->>'status') != 'Active')) THEN
    RETURN;
  END IF;

  UPDATE "inspectionDocument"
  SET status = 'Archived'
  WHERE "documentFamilyId" = p_new->>'documentFamilyId'
    AND "companyId" = p_new->>'companyId'
    AND id != p_new->>'id'
    AND status = 'Active';
END;
$$;

SELECT attach_event_trigger('inspectionDocument',
  ARRAY['sync_archive_other_inspection_documents']::TEXT[],
  ARRAY[]::TEXT[]
);

-- List view: one row per family (latest version) with versions aggregate
CREATE OR REPLACE VIEW "inspectionDocuments" WITH (SECURITY_INVOKER=true) AS
  SELECT
    d1.*,
    i."readableIdWithRevision" AS "partReadableId",
    jsonb_agg(
      jsonb_build_object(
        'id', d2."id",
        'version', d2."version",
        'status', d2."status"
      )
    ) AS "versions"
  FROM "inspectionDocument" d1
  JOIN "inspectionDocument" d2
    ON d1."documentFamilyId" = d2."documentFamilyId"
    AND d1."companyId" = d2."companyId"
  LEFT JOIN "item" i ON i."id" = d1."partId"
  WHERE d1."version" = (
    SELECT MAX("version")
    FROM "inspectionDocument" d3
    WHERE d3."documentFamilyId" = d1."documentFamilyId"
      AND d3."companyId" = d1."companyId"
  )
  GROUP BY
    d1."id",
    d1."companyId",
    d1."partId",
    d1."drawingNumber",
    d1."version",
    d1."status",
    d1."documentFamilyId",
    d1."storagePath",
    d1."fileName",
    d1."pageCount",
    d1."defaultPageWidth",
    d1."defaultPageHeight",
    d1."uploadedBy",
    d1."createdBy",
    d1."createdAt",
    d1."updatedBy",
    d1."updatedAt",
    i."readableIdWithRevision";

-- Guard atomic save: only Draft documents may be edited
CREATE OR REPLACE FUNCTION save_inspection_document_atomic(
  p_inspection_document_id TEXT,
  p_company_id TEXT,
  p_user_id TEXT,
  p_pdf_url TEXT DEFAULT NULL,
  p_page_count INTEGER DEFAULT NULL,
  p_default_page_width DOUBLE PRECISION DEFAULT NULL,
  p_default_page_height DOUBLE PRECISION DEFAULT NULL,
  p_features JSONB DEFAULT '{}'::jsonb,
  p_balloons JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_document RECORD;
  v_storage_path TEXT;
  v_features_create JSONB := COALESCE(p_features->'create', '[]'::jsonb);
  v_features_update JSONB := COALESCE(p_features->'update', '[]'::jsonb);
  v_features_delete JSONB := COALESCE(p_features->'delete', '[]'::jsonb);
  v_balloons_create JSONB := COALESCE(p_balloons->'create', '[]'::jsonb);
  v_balloons_update JSONB := COALESCE(p_balloons->'update', '[]'::jsonb);
  v_balloons_delete JSONB := COALESCE(p_balloons->'delete', '[]'::jsonb);
  v_item JSONB;
  v_temp_id TEXT;
  v_feature_id TEXT;
  v_balloon_id TEXT;
  v_feature_id_map JSONB := '{}'::jsonb;
  v_balloon_anchor_id_map JSONB := '{}'::jsonb;
BEGIN
  SELECT *
  INTO v_document
  FROM "inspectionDocument"
  WHERE "id" = p_inspection_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection document not found';
  END IF;

  IF v_document."companyId" <> p_company_id THEN
    RAISE EXCEPTION 'Inspection document does not belong to this company';
  END IF;

  IF v_document."status" IS DISTINCT FROM 'Draft'::"inspectionDocumentStatus" THEN
    RAISE EXCEPTION 'Only draft inspection documents can be edited';
  END IF;

  v_storage_path := NULLIF(
    regexp_replace(COALESCE(p_pdf_url, ''), '^/file/preview/private/', ''),
    ''
  );

  UPDATE "inspectionDocument"
  SET
    "storagePath" = CASE
      WHEN v_storage_path IS NOT NULL THEN v_storage_path
      ELSE "storagePath"
    END,
    "fileName" = CASE
      WHEN v_storage_path IS NOT NULL THEN split_part(v_storage_path, '/', array_length(string_to_array(v_storage_path, '/'), 1))
      ELSE "fileName"
    END,
    "uploadedBy" = CASE
      WHEN v_storage_path IS NOT NULL THEN p_user_id
      ELSE "uploadedBy"
    END,
    "pageCount" = CASE
      WHEN p_page_count IS NOT NULL AND p_page_count > 0 THEN p_page_count
      ELSE "pageCount"
    END,
    "defaultPageWidth" = CASE
      WHEN p_default_page_width IS NOT NULL AND p_default_page_width > 0 THEN p_default_page_width
      ELSE "defaultPageWidth"
    END,
    "defaultPageHeight" = CASE
      WHEN p_default_page_height IS NOT NULL AND p_default_page_height > 0 THEN p_default_page_height
      ELSE "defaultPageHeight"
    END,
    "updatedBy" = p_user_id,
    "updatedAt" = NOW()
  WHERE "id" = p_inspection_document_id
    AND "companyId" = p_company_id;

  IF jsonb_array_length(v_features_delete) > 0 THEN
    DELETE FROM "inspectionFeature"
    WHERE "id" = ANY (
      SELECT jsonb_array_elements_text(v_features_delete)
    )
      AND "inspectionDocumentId" = p_inspection_document_id
      AND "companyId" = p_company_id;
  END IF;

  IF jsonb_array_length(v_balloons_delete) > 0 THEN
    DELETE FROM "balloon"
    WHERE "id" = ANY (
      SELECT jsonb_array_elements_text(v_balloons_delete)
    )
      AND "inspectionDocumentId" = p_inspection_document_id
      AND "companyId" = p_company_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_features_create)
  LOOP
    INSERT INTO "inspectionFeature" (
      "inspectionDocumentId",
      "companyId",
      "pageNumber",
      "label",
      "description",
      "nominalValue",
      "tolerancePlus",
      "toleranceMinus",
      "unit",
      "type",
      "createdBy",
      "updatedBy"
    ) VALUES (
      p_inspection_document_id,
      p_company_id,
      COALESCE((v_item->>'pageNumber')::INTEGER, 1),
      COALESCE(v_item->>'label', ''),
      CASE WHEN v_item ? 'description' THEN v_item->>'description' ELSE NULL END,
      CASE WHEN v_item ? 'nominalValue' THEN v_item->>'nominalValue' ELSE NULL END,
      CASE WHEN v_item ? 'tolerancePlus' THEN v_item->>'tolerancePlus' ELSE NULL END,
      CASE WHEN v_item ? 'toleranceMinus' THEN v_item->>'toleranceMinus' ELSE NULL END,
      CASE WHEN v_item ? 'unit' THEN v_item->>'unit' ELSE NULL END,
      COALESCE((v_item->>'type')::"procedureStepType", 'Measurement'::"procedureStepType"),
      p_user_id,
      p_user_id
    )
    RETURNING "id" INTO v_feature_id;

    v_temp_id := v_item->>'tempId';
    IF v_temp_id IS NOT NULL AND length(v_temp_id) > 0 THEN
      v_feature_id_map := v_feature_id_map || jsonb_build_object(v_temp_id, v_feature_id);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_balloons_create)
  LOOP
    v_feature_id := NULL;
    IF v_item ? 'inspectionFeatureId' THEN
      v_feature_id := v_item->>'inspectionFeatureId';
    ELSIF v_item ? 'tempInspectionFeatureId' THEN
      v_temp_id := v_item->>'tempInspectionFeatureId';
      IF v_feature_id_map ? v_temp_id THEN
        v_feature_id := v_feature_id_map->>v_temp_id;
      END IF;
    END IF;

    IF v_feature_id IS NULL OR length(v_feature_id) = 0 THEN
      RAISE EXCEPTION 'balloon create requires inspectionFeatureId or tempInspectionFeatureId';
    END IF;

    INSERT INTO "balloon" (
      "inspectionDocumentId",
      "companyId",
      "inspectionFeatureId",
      "pageNumber",
      "regionX",
      "regionY",
      "regionWidth",
      "regionHeight",
      "xCoordinate",
      "yCoordinate",
      "createdBy",
      "updatedBy"
    ) VALUES (
      p_inspection_document_id,
      p_company_id,
      v_feature_id,
      COALESCE((v_item->>'pageNumber')::INTEGER, 1),
      COALESCE((v_item->>'regionX')::DOUBLE PRECISION, 0),
      COALESCE((v_item->>'regionY')::DOUBLE PRECISION, 0),
      COALESCE((v_item->>'regionWidth')::DOUBLE PRECISION, 0.1),
      COALESCE((v_item->>'regionHeight')::DOUBLE PRECISION, 0.1),
      COALESCE((v_item->>'xCoordinate')::DOUBLE PRECISION, 0),
      COALESCE((v_item->>'yCoordinate')::DOUBLE PRECISION, 0),
      p_user_id,
      p_user_id
    )
    RETURNING "id" INTO v_balloon_id;

    v_temp_id := v_item->>'tempBalloonAnchorId';
    IF v_temp_id IS NOT NULL AND length(v_temp_id) > 0 THEN
      v_balloon_anchor_id_map := v_balloon_anchor_id_map || jsonb_build_object(v_temp_id, v_balloon_id);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_features_update)
  LOOP
    UPDATE "inspectionFeature"
    SET
      "pageNumber" = CASE WHEN v_item ? 'pageNumber' THEN (v_item->>'pageNumber')::INTEGER ELSE "pageNumber" END,
      "label" = CASE WHEN v_item ? 'label' THEN v_item->>'label' ELSE "label" END,
      "description" = CASE WHEN v_item ? 'description' THEN v_item->>'description' ELSE "description" END,
      "nominalValue" = CASE WHEN v_item ? 'nominalValue' THEN v_item->>'nominalValue' ELSE "nominalValue" END,
      "tolerancePlus" = CASE WHEN v_item ? 'tolerancePlus' THEN v_item->>'tolerancePlus' ELSE "tolerancePlus" END,
      "toleranceMinus" = CASE WHEN v_item ? 'toleranceMinus' THEN v_item->>'toleranceMinus' ELSE "toleranceMinus" END,
      "unit" = CASE WHEN v_item ? 'unit' THEN v_item->>'unit' ELSE "unit" END,
      "type" = CASE WHEN v_item ? 'type' THEN (v_item->>'type')::"procedureStepType" ELSE "type" END,
      "updatedBy" = p_user_id,
      "updatedAt" = NOW()
    WHERE "id" = v_item->>'id'
      AND "inspectionDocumentId" = p_inspection_document_id
      AND "companyId" = p_company_id;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_balloons_update)
  LOOP
    UPDATE "balloon"
    SET
      "pageNumber" = CASE WHEN v_item ? 'pageNumber' THEN (v_item->>'pageNumber')::INTEGER ELSE "pageNumber" END,
      "regionX" = CASE WHEN v_item ? 'regionX' THEN (v_item->>'regionX')::DOUBLE PRECISION ELSE "regionX" END,
      "regionY" = CASE WHEN v_item ? 'regionY' THEN (v_item->>'regionY')::DOUBLE PRECISION ELSE "regionY" END,
      "regionWidth" = CASE WHEN v_item ? 'regionWidth' THEN (v_item->>'regionWidth')::DOUBLE PRECISION ELSE "regionWidth" END,
      "regionHeight" = CASE WHEN v_item ? 'regionHeight' THEN (v_item->>'regionHeight')::DOUBLE PRECISION ELSE "regionHeight" END,
      "xCoordinate" = CASE WHEN v_item ? 'xCoordinate' THEN (v_item->>'xCoordinate')::DOUBLE PRECISION ELSE "xCoordinate" END,
      "yCoordinate" = CASE WHEN v_item ? 'yCoordinate' THEN (v_item->>'yCoordinate')::DOUBLE PRECISION ELSE "yCoordinate" END,
      "updatedBy" = p_user_id,
      "updatedAt" = NOW()
    WHERE "id" = v_item->>'id'
      AND "inspectionDocumentId" = p_inspection_document_id
      AND "companyId" = p_company_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'featureIdMap', v_feature_id_map,
    'balloonAnchorIdMap', v_balloon_anchor_id_map,
    'features', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f."id",
        'inspectionDocumentId', f."inspectionDocumentId",
        'companyId', f."companyId",
        'pageNumber', f."pageNumber",
        'label', f."label",
        'description', f."description",
        'nominalValue', f."nominalValue",
        'tolerancePlus', f."tolerancePlus",
        'toleranceMinus', f."toleranceMinus",
        'unit', f."unit",
        'type', f."type",
        'balloonId', b."id",
        'createdBy', f."createdBy",
        'updatedBy', f."updatedBy",
        'createdAt', f."createdAt",
        'updatedAt', f."updatedAt"
      ) ORDER BY f."createdAt" ASC)
      FROM "inspectionFeature" f
      LEFT JOIN "balloon" b
        ON b."inspectionFeatureId" = f."id"
        AND b."companyId" = f."companyId"
      WHERE f."inspectionDocumentId" = p_inspection_document_id
        AND f."companyId" = p_company_id
    ), '[]'::jsonb),
    'balloons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b."id",
        'inspectionDocumentId', b."inspectionDocumentId",
        'companyId', b."companyId",
        'inspectionFeatureId', b."inspectionFeatureId",
        'pageNumber', b."pageNumber",
        'regionX', b."regionX",
        'regionY', b."regionY",
        'regionWidth', b."regionWidth",
        'regionHeight', b."regionHeight",
        'xCoordinate', b."xCoordinate",
        'yCoordinate', b."yCoordinate",
        'createdBy', b."createdBy",
        'updatedBy', b."updatedBy",
        'createdAt', b."createdAt",
        'updatedAt', b."updatedAt"
      ) ORDER BY b."createdAt" ASC)
      FROM "balloon" b
      WHERE b."inspectionDocumentId" = p_inspection_document_id
        AND b."companyId" = p_company_id
    ), '[]'::jsonb),
    'anchors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b."id",
        'pageNumber', b."pageNumber",
        'xCoordinate', b."regionX",
        'yCoordinate', b."regionY",
        'width', b."regionWidth",
        'height', b."regionHeight"
      ) ORDER BY b."createdAt" ASC)
      FROM "balloon" b
      WHERE b."inspectionDocumentId" = p_inspection_document_id
        AND b."companyId" = p_company_id
    ), '[]'::jsonb)
  );
END;
$$;
