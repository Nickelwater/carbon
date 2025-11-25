-- Add 'Purchase Order' to itemLedgerDocumentType so we can track cost ledger entries from PO finalize
-- This allows us to create costLedger entries when a PO is finalized, and delete/recreate them if the PO is reopened and finalized again
ALTER TYPE "itemLedgerDocumentType" ADD VALUE 'Purchase Order';
