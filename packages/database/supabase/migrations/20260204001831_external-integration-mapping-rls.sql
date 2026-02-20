DROP POLICY IF EXISTS "manage_externalIntegrationMapping" ON "externalIntegrationMapping";

CREATE POLICY "SELECT" ON "externalIntegrationMapping"
FOR SELECT
USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "externalIntegrationMapping"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

