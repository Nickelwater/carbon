-- Add externalId column to salesInvoice for accounting provider sync
ALTER TABLE "salesInvoice" 
ADD COLUMN IF NOT EXISTS "externalId" JSONB;

-- Create index for efficient lookups by provider
CREATE INDEX IF NOT EXISTS "salesInvoice_externalId_idx" 
ON "salesInvoice" USING GIN ("externalId");
