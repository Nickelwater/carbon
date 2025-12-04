

ALTER TABLE "userAttribute" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SELECT" ON "public"."userAttribute"
FOR SELECT USING (
  "userAttributeCategoryId" IN (
    SELECT "id" FROM "userAttributeCategory" WHERE "companyId" = ANY (
      get_permission_companies('resources_view')
    )
  )
);

CREATE POLICY "INSERT" ON "public"."userAttribute"
FOR INSERT WITH CHECK (
  "userAttributeCategoryId" IN (
    SELECT "id" FROM "userAttributeCategory" WHERE "companyId" = ANY (
      get_permission_companies('resources_create')
    )
  )
);

CREATE POLICY "UPDATE" ON "public"."userAttribute"
FOR UPDATE USING (
  "userAttributeCategoryId" IN (
    SELECT "id" FROM "userAttributeCategory" WHERE "companyId" = ANY (
      get_permission_companies('resources_update')
    )
  )
);

CREATE POLICY "DELETE" ON "public"."userAttribute"
FOR DELETE USING (
  "userAttributeCategoryId" IN (
    SELECT "id" FROM "userAttributeCategory" WHERE "companyId" = ANY (
      get_permission_companies('resources_delete')
    )
  )
);

ALTER TABLE "userAttributeCategory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."userAttributeCategory"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT get_permission_companies('resources_view')::text[]
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."userAttributeCategory"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT get_permission_companies('resources_create')::text[]
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."userAttributeCategory"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT get_permission_companies('resources_update')::text[]
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."userAttributeCategory"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT get_permission_companies('resources_delete')::text[]
    )::text[]
  )
);