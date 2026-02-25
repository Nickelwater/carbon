-- Add Part Number sequence for existing companies (new companies get it from seed)
INSERT INTO "sequence" ("table", "name", "prefix", "suffix", "next", "size", "step", "companyId")
SELECT
  'Part',
  'Part Number',
  '',
  NULL,
  0,
  9,
  1,
  c.id
FROM "company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "sequence" s
  WHERE s."table" = 'Part' AND s."companyId" = c.id
);

-- get_next_numeric_sequence: when a sequence row exists for this item_type, use get_next_sequence;
-- otherwise fall back to current max from item + 1 (padded).
CREATE OR REPLACE FUNCTION get_next_numeric_sequence(company_id text, item_type "itemType")
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sequence"
    WHERE "table" = item_type::text
    AND "companyId" = company_id
  ) THEN
    RETURN get_next_sequence(item_type::text, company_id);
  END IF;

  SELECT COALESCE(MAX(("readableId")::integer), 0) + 1
  INTO v_next_val
  FROM "item"
  WHERE "companyId" = company_id
  AND "type" = item_type
  AND "readableId" ~ '^[0-9]+$';

  RETURN lpad(v_next_val::text, 9, '0');
END;
$$;
