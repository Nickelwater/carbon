-- Phase 2.5: add the generic 'Inspection' document type to itemLedgerDocumentType
-- so the disposition writer can move off the legacy 'Inbound Inspection' label
-- now that Lot inspections (job completions) also post through this same path.
-- Additive only — 'Inbound Inspection' stays in the enum so historical ledger
-- rows and readers that haven't been migrated yet keep resolving.
ALTER TYPE "itemLedgerDocumentType" ADD VALUE IF NOT EXISTS 'Inspection';
