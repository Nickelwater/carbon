CREATE TYPE "riskRegisterType" AS ENUM ('Risk', 'Opportunity');
ALTER TABLE "riskRegister" ADD COLUMN "notes" JSON DEFAULT '{}';
ALTER TABLE "riskRegister" ADD COLUMN "type" "riskRegisterType" NOT NULL DEFAULT 'Risk';

CREATE INDEX "riskRegister_type_idx" ON "riskRegister" ("type", "companyId");