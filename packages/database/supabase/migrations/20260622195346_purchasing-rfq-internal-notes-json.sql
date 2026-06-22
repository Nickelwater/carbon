-- "purchasingRfq"."internalNotes" was created as TEXT, unlike every other entity
-- (purchaseOrder, supplierQuote, quote, purchasingRfqLine) where it is JSON. The
-- rich-text Editor writes a JSONContent object, so the TEXT column stored a JSON
-- string that the loader handed back to the Editor unparsed, rendering raw JSON.
-- Align the column type with the rest of the codebase.

ALTER TABLE "purchasingRfq"
  ALTER COLUMN "internalNotes" TYPE JSON USING
    CASE
      WHEN "internalNotes" IS NULL OR "internalNotes" = '' THEN '{}'::JSON
      ELSE "internalNotes"::JSON
    END,
  ALTER COLUMN "internalNotes" SET DEFAULT '{}';
