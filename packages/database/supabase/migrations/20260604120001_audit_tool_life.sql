-- Audit tool life policy changes on the tool table.

SELECT attach_event_trigger('tool', ARRAY[]::TEXT[], ARRAY[]::TEXT[]);

DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN
    SELECT id FROM "company" WHERE "auditLogEnabled" = TRUE
  LOOP
    INSERT INTO "eventSystemSubscription" (
      "name",
      "table",
      "companyId",
      "operations",
      "handlerType",
      "config",
      "filter",
      "active"
    )
    VALUES (
      'audit-tool-life-policy',
      'tool',
      company_record.id,
      ARRAY['INSERT', 'UPDATE', 'DELETE'],
      'AUDIT',
      '{}'::jsonb,
      '{}'::jsonb,
      TRUE
    )
    ON CONFLICT ON CONSTRAINT "unique_subscription_name_per_company"
    DO UPDATE SET
      "operations" = EXCLUDED."operations",
      "handlerType" = EXCLUDED."handlerType",
      "config" = EXCLUDED."config",
      "filter" = EXCLUDED."filter",
      "active" = EXCLUDED."active";
  END LOOP;
END;
$$;
