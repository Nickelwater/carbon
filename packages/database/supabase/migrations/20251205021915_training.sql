CREATE TYPE "trainingFrequency" AS ENUM (
  'Once',
  'Quarterly',
  'Annual'
);

CREATE TYPE "trainingStatus" AS ENUM (
  'Draft',
  'Active',
  'Archived'
);

CREATE TYPE "trainingType" AS ENUM (
  'Mandatory',
  'Optional'
);

CREATE TABLE "training" (
  "id" TEXT NOT NULL DEFAULT id('train'),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" NUMERIC NOT NULL DEFAULT 0,
  "processId" TEXT,
  "status" "trainingStatus" NOT NULL DEFAULT 'Draft',
  "frequency" "trainingFrequency" NOT NULL DEFAULT 'Once',
  "type" "trainingType" NOT NULL DEFAULT 'Mandatory',
  "content" JSON DEFAULT '{}',
  "estimatedDuration" TEXT,
  "tags" TEXT[],
  "assignee" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "training_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_version_check" CHECK ("version" >= 0),
  CONSTRAINT "training_version_unique" UNIQUE ("name", "companyId", "version"),
  CONSTRAINT "training_processId_fkey" FOREIGN KEY ("processId") REFERENCES "process"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "training_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "training_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "training_companyId_idx" ON "training" ("companyId");
CREATE INDEX "training_processId_idx" ON "training" ("processId");

ALTER TABLE "training" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."training"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."training"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."training"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."training"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);


CREATE TABLE "trainingAssignment" (
  "id" TEXT NOT NULL DEFAULT id('ta'),
  "trainingId" TEXT NOT NULL,
  "groupIds" TEXT[],
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "trainingAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trainingAssignment_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "trainingAssignment_companyId_idx" ON "trainingAssignment" ("companyId");
CREATE INDEX "trainingAssignment_trainingId_idx" ON "trainingAssignment" ("trainingId");
CREATE INDEX "trainingAssignment_groupIds_idx" ON "trainingAssignment" USING GIN ("groupIds");

ALTER TABLE "trainingAssignment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."trainingAssignment"
FOR SELECT USING (
  "companyId" = ANY (
    ( 
      SELECT
        get_companies_with_employee_permission ('people_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."trainingAssignment"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."trainingAssignment"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."trainingAssignment"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);

CREATE TABLE "trainingCompletion" (
  "id" SERIAL PRIMARY KEY,
  "trainingAssignmentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "completedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "trainingCompletion_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "trainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "trainingCompletion_companyId_idx" ON "trainingCompletion" ("companyId");
CREATE INDEX "trainingCompletion_trainingAssignmentId_idx" ON "trainingCompletion" ("trainingAssignmentId");
CREATE INDEX "trainingCompletion_employeeId_idx" ON "trainingCompletion" ("employeeId");

ALTER TABLE "trainingCompletion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."trainingCompletion"
FOR SELECT USING (
  "companyId" = ANY (
    ( 
      SELECT
        get_companies_with_employee_permission ('people_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."trainingCompletion"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  ) OR (
    auth.uid()::text = "employeeId"
    AND "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_role ()
      )::text[]
    )
  )
);

CREATE POLICY "UPDATE" ON "public"."trainingCompletion"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."trainingCompletion"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);

CREATE TYPE "trainingQuestionType" AS ENUM (
  'MultipleChoice',
  'TrueFalse',
  'MultipleAnswers',
  'MatchingPairs',
  'Numerical'
);

CREATE TABLE "trainingQuestion" (
  "id" TEXT NOT NULL DEFAULT id('tq'),
  "trainingId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "type" "trainingQuestionType" NOT NULL,
  "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "required" BOOLEAN DEFAULT TRUE,

  -- For MultipleChoice and MultipleAnswers
  "options" TEXT[],
  "correctAnswers" TEXT[],

  -- For TrueFalse
  "correctBoolean" BOOLEAN,

  -- For MatchingPairs: stored as JSON array [{left: "...", right: "..."}, ...]
  "matchingPairs" JSON,

  -- For Numerical
  "correctNumber" DECIMAL,
  "tolerance" DECIMAL,

  -- Audit fields
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "trainingQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trainingQuestion_trainingId_fkey" FOREIGN KEY ("trainingId")
    REFERENCES "training"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingQuestion_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingQuestion_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingQuestion_updatedBy_fkey" FOREIGN KEY ("updatedBy")
    REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "trainingQuestion_trainingId_idx" ON "trainingQuestion" ("trainingId");
CREATE INDEX "trainingQuestion_companyId_idx" ON "trainingQuestion" ("companyId");

ALTER TABLE "trainingQuestion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."trainingQuestion"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."trainingQuestion"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."trainingQuestion"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."trainingQuestion"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);

DROP VIEW IF EXISTS "trainings";
CREATE OR REPLACE VIEW "trainings" WITH(SECURITY_INVOKER=true) AS
  SELECT
    t1."id",
    t1."name",
    t1."description",
    t1."version",
    t1."status",
    t1."type",
    t1."frequency",
    t1."assignee",
    t1."estimatedDuration",
    t1."tags",
    t1."companyId",
    jsonb_agg(
      jsonb_build_object(
        'id', t2."id",
        'version', t2."version",
        'status', t2."status"
      )
    ) as "versions"
  FROM "training" t1
  JOIN "training" t2 ON t1."name" = t2."name" AND t1."companyId" = t2."companyId"
  WHERE t1."version" = (
    SELECT MAX("version")
    FROM "training" t3
    WHERE t3."name" = t1."name"
    AND t3."companyId" = t1."companyId"
  )
  GROUP BY t1."id", t1."name", t1."description", t1."version", t1."status", t1."type",
           t1."frequency", t1."assignee", t1."estimatedDuration", t1."tags", t1."companyId";

CREATE OR REPLACE FUNCTION get_training_assignments_by_user(user_id text)
RETURNS TABLE (
  "trainingAssignmentId" INTEGER,
  "name" TEXT,
  "description" TEXT,
  "version" NUMERIC,
  "status" "trainingStatus",
  "frequency" "trainingFrequency",
  "type" "trainingType",
  "content" JSON,
  "estimatedDuration" TEXT,
  "tags" TEXT[],
  "assignee" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "createdBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ta.id as "trainingAssignmentId",
    t.name,
    t.description,
    t.version,
    t.status,
    t.frequency,
    t.type,
    t.content,
    t.estimatedDuration,
    t.tags,
    t.assignee,
    ta."companyId",
    ta."createdAt",
    ta."createdBy",
    ta."updatedAt",
    ta."updatedBy"
  FROM "trainingAssignment" ta
  JOIN "training" t ON ta."trainingId" = t.id
  WHERE ta."groupIds" && ARRAY(
    SELECT group_id FROM groups_for_user(user_id)
  );
END;
$$;

