# Parts per Cycle (formerly Cavity Multiplier)

## Plan

- [x] Rename quoting field to "Parts per Cycle" (`partsPerCycle`); keep costing logic (divide labor/machine per unit)
- [x] Add `partsPerCycle` to `methodOperation` and `jobOperation`; copy through get-method flows
- [x] MES: show cycles when `partsPerCycle > 1`; complete in cycles; store parts in `quantityComplete`
- [x] Shared helpers in `@carbon/utils` (`parts-per-cycle.ts`)

## Review

- Migration: `20260601120000_parts_per_cycle.sql` renames quote `cavityMultiplier`, adds columns, updates `get_job_operation_by_id`
- ERP: Quote/Part/Job BOP forms + validators; get-method + trigger-rework copy field
- MES: `QuantityModal`, `complete.tsx`, `JobOperation` progress UI
- Apply migration locally before testing MES cycle completion
