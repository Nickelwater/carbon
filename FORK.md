# Nickelwater Carbon Fork

This repository is a long-lived fork of [crbnos/carbon](https://github.com/crbnos/carbon) with features that will remain unique to this deployment. Upstream changes are still merged periodically. This document records what is fork-specific, where merge conflicts are likely, and how to integrate upstream safely.

## Remotes

| Remote     | URL                              | Purpose                          |
| ---------- | -------------------------------- | -------------------------------- |
| `origin`   | `https://github.com/Nickelwater/carbon.git` | This fork (push here)   |
| `upstream` | `https://github.com/crbnos/carbon.git`      | Upstream Carbon (fetch only) |

```bash
git fetch upstream
git remote set-url --push upstream no-push   # optional: prevent accidental pushes
```

## Fork-only feature inventory

Update this section when adding or removing fork-specific behavior.

### Shipping & fulfillment

- **4×6 shipping labels** — PDF preview, ZPL download, print queue (`ShippingLabelPDF`, rasterized ZPL for correct orientation on physical stock).
- **Box-quantity labels** — `itemPackaging` table; split shipped qty into multiple labels with partial box on the last label (`packages/utils/src/shippingLabelBoxes.ts`).
- **Multi-batch shipment tracking** — Multiple batch numbers per shipment line with allocated quantities (`packages/utils/src/shipmentBatchTracking.ts`, `ShipmentLines.tsx`, `lines.tracking.tsx`).
- **Packing slip / pack list layout** — Redesigned PDF (`packages/documents/src/pdf/blocks/packingSlip/`).
- **Shipment line picking** — Inventory limits and picking UX improvements (`ShipmentLines.tsx`).
- **Multi–sales-order shipments** — Customer data hydration and related sales document UX.

### Sales & quoting

- **Quote parts** — Part management and pricing on quotes (`quote_parts` migrations, `QuoteLineForm`, `useLineCosts`).
- **Contract customer** — `contractCustomer` flag and UI (`ContractCustomerPartLabel`, customers view migrations).
- **Promote quote part** — Item search and quote-to-part workflows.

### Production & MES

- **Operation time basis** — Per-cycle vs per-unit time, quantity display (`operation_time_basis` migrations, `packages/utils/src/operation-time.ts`).
- **Machine-primary operations** — Setup rate, operator attention fields (`machine_primary_operations` migration).
- **Parts per cycle** — Cavitation / parts-per-cycle on methods (`parts_per_cycle` migration).
- **Tool life tracking** — Tool life accrual, MES tools page (`tool_life_*` migrations, `tool-life.service.ts`).
- **Kanban operation quantity** — `KanbanOperationQuantity` component and utils.

### Quality & inspection

- **Inspection document versioning** — Draft/active/superseded lifecycle, approval integration.
- **Inspection lot sampling** — Link inbound inspection lots to inspection documents; scan sample UX.
- **Part file attachments on inspection documents** — Attach part files when creating inspection docs.
- **Production inspection** — `production-inspection` migration and related quality flows.

### Inventory & items

- **Part packaging fields** — Box qty, part weight, standard packaging item on part inventory (`itemPackaging` migration, `PickMethodForm`).
- **Storage unit traceability** — Enhanced storage unit / traceability UI.
- **Inbound inspection for batch lots** — Batch lot inspection enhancements.

### Printing

- **Shipping label print pipeline** — `runPrintJob` synchronous manual print, `deliverPrintJob`, PDF→ZPL rasterization (`packages/jobs/src/print/`, `packages/printing/src/delivery/`).
- **Print job per-package descriptions** — Multi-label print jobs keyed by package index.

### Dev & ops

- **LAN dev mode** — `crbn up --lan` for local-network development (`packages/dev/`).
- **Windows patch** — `@react-router/dev` LF patch for patch-package on Windows (`patches/`).
- **Database backup docs** — Fork-specific backup/restore notes (see `README.md` / docs if present).

## High-conflict areas

These files or packages are heavily customized relative to upstream. Expect conflicts and re-test after every upstream merge.

| Area | Paths | Why |
| ---- | ----- | --- |
| Shipment lines UI | `apps/erp/app/modules/inventory/ui/Shipments/ShipmentLines.tsx` | Large fork rewrite (batch tracking, picking) |
| Shipping labels | `packages/documents/src/shipping-label/`, `packages/documents/src/zpl/`, `packages/documents/src/pdf/ShippingLabelPDF.tsx` | Fork-only label pipeline |
| Print jobs | `packages/jobs/src/print/`, `packages/jobs/src/inngest/functions/tasks/print-job/` | Custom delivery and rasterization |
| Quality / inspection | `apps/erp/app/modules/quality/` | Versioning, lot sampling, editor/viewer |
| Quotes & sales | `apps/erp/app/modules/sales/ui/Quotes/`, `sales.service.ts` | Quote parts, contract customer |
| Production costing | `packages/utils/src/operation-time.ts`, `operation-costing.ts`, `parts-per-cycle.ts` | Fork costing model |
| Database types | `packages/database/src/types.ts` | Generated; always regen after merge |
| Migrations | `packages/database/supabase/migrations/` | Fork-only SQL files (see below) |
| Locale | `packages/locale/locales/*/erp.po` | Many fork strings |

Prefer adding **new files** for future fork features instead of further expanding conflicts in the rows above.

## Fork-only migrations

Migrations present on this fork that may not exist upstream (or differ in content). **Never edit applied migrations** — only add new ones. On merge conflicts, keep both upstream and fork migration files unless they duplicate the same schema change.

```
20260219000001_customer_contract_customer_flag.sql
20260220000000_quote_parts.sql
20260220100000_part_sequence_and_get_next_numeric.sql
20260221100000_quote_operation_cavity_multiplier.sql
20260222100000_sales_order_line_line_number.sql
20260223100000_sales_order_lines_view_recreate.sql
20260224100000_quote_line_line_number.sql
20260224100001_quote_lines_view_recreate.sql
20260321143847_method-type-migration.sql
20260330120000_parts_view_customer_part_summary.sql
20260412120000_fix-quote-lines-view-quote-parts.sql
20260412220000_fix-quote-make-method-version-interceptors.sql
20260504120000_customers_view_contract_customer.sql
20260523120000_fix-quote-lines-view-quote-parts.sql
20260523130000_fix-quote-methods-quote-parts.sql
20260523140000_restore-parts-view-customer-part-summary.sql
20260523150000_production-inspection.sql
20260523160000_fix-batch-inspection-samples.sql
20260601120000_parts_per_cycle.sql
20260602120000_operation_time_basis.sql
20260602130000_kanban_operation_time_basis.sql
20260602140000_schedule_jobs_operation_time_basis.sql
20260603115959_machine_primary_operations.sql
20260603120000_remove-storage-unit-rules.sql
20260603120001_complete_job_production_event_setup_rate.sql
20260603130000_rename-custom-rule-to-storage-rule.sql
20260604115959_tool_life_tracking.sql
20260604120001_audit_tool_life.sql
20260605120000_fix_tool_life_accrual_auto_issue.sql
20260605120001_fix_tool_life_machine_time_column.sql
20260605120002_ensure_job_operation_tools.sql
20260605120003_fix_permanent_tool_serial_lookup.sql
20260615120000_inspection_document_lot_link.sql
20260615120001_inspection-document-versions.sql
20260623154712_customers_view_contract_customer.sql
20260626175552_item_packaging.sql
```

After merging upstream, run migrations on a fresh or staging DB before production:

```bash
crbn migrate
# or: pnpm db:migrate (from packages/database, with .env.local loaded)
```

Regenerate types if upstream changed schema:

```bash
# Follow llm/workflows/database-migration.md and your usual regen command
```

## Upstream merge procedure

Do **not** merge `upstream/main` directly into production without a test pass. Use a dedicated branch.

```bash
git fetch upstream
git checkout main
git pull origin main

git checkout -b merge/upstream-$(date +%Y-%m-%d)
git merge upstream/main
```

### Resolving conflicts

1. **Migrations** — Keep both files when timestamps differ. If upstream and fork changed the same table, read both SQL files and add a new fork migration if needed to reconcile. **Never share a version prefix** — if fork and upstream collide (e.g. both `20260604120000_*`), rename the fork file to a unique timestamp that still sorts before any dependent fork migrations. If your DB already recorded the fork under the old version:
   ```sql
   UPDATE supabase_migrations.schema_migrations
   SET version = '20260604115959', name = 'tool_life_tracking'
   WHERE version = '20260604120000' AND name = 'tool_life_tracking';
   ```
2. **`packages/database/src/types.ts`** — Prefer upstream structure, then regen; re-apply any manual fork edits only if still required.
3. **`pnpm-lock.yaml`** — Accept merge, then `pnpm install`.
4. **Shared UI files** (e.g. `ShipmentLines.tsx`) — Merge carefully; preserve fork behavior listed in this doc, adopt upstream bug fixes and refactors where compatible.
5. **Locale `.po` files** — Run `pnpm lingui:extract` / `pnpm lingui:compile` after resolving.

### Finish the merge

```bash
pnpm install
pnpm typecheck          # expect some baseline noise; fix new errors from merge
pnpm test               # if applicable
crbn up                 # local smoke (user runs DB rebuild if needed)

git push -u origin merge/upstream-YYYY-MM-DD
# Open PR to main, or merge locally after smoke passes
```

Tag the fork before large upstream merges for easy rollback:

```bash
git tag fork-pre-upstream-YYYY-MM-DD
git push origin fork-pre-upstream-YYYY-MM-DD
```

## Post-merge smoke checklist

Run after every upstream integration. Check off in the PR description.

### Core ERP

- [ ] Login / dev bypass
- [ ] Open a shipment — lines load, no console errors
- [ ] Post a shipment (or dry-run through post modal validation)

### Fork: shipping & labels

- [ ] Shipment line — assign multiple batches; quantities sum to shipped qty
- [ ] Shipping label PDF preview — correct layout, all packages when box qty set
- [ ] Shipping label print to ZPL printer — labels physically print
- [ ] Packing slip PDF generates without error

### Fork: inventory & parts

- [ ] Part inventory — box qty, part weight, standard packaging save/load
- [ ] Storage units / traceability views load

### Fork: sales & quotes

- [ ] Quote with quote parts — line pricing, promote part
- [ ] Sales order — contract customer label displays when applicable
- [ ] Multi-SO shipment — customer fields correct on documents

### Fork: production & MES

- [ ] Job operation — operation time basis displays correctly
- [ ] Kanban board — operation quantity display
- [ ] Tool life form (if used) — accrual/issue flow

### Fork: quality

- [ ] Inspection document — create, version, attach part files
- [ ] Inbound inspection lot — link to inspection document, scan sample

### Fork: printing

- [ ] Settings → Printing — test print still works
- [ ] Print Manager — job completes (not stuck queued)

## Guidelines for new fork work

1. **New module or package** over editing upstream-owned files when possible.
2. **New migration** with a new timestamp for every schema change.
3. **Utils in `packages/utils/`** for reusable fork logic (see `shippingLabelBoxes.ts`, `shipmentBatchTracking.ts`).
4. **Document** new features in the inventory section above.
5. **Avoid** drive-by refactors in shared files during feature work — increases merge cost.
6. When upstream ships a similar feature, explicitly decide: **adopt upstream**, **keep fork**, or **merge behaviors** — do not leave accidental hybrids.

## Adopting upstream vs keeping fork code

| Signal | Action |
| ------ | ------ |
| Upstream adds same feature with cleaner API | Port fork behavior onto upstream’s structure; delete duplicate fork code in a follow-up PR |
| Upstream fixes bug in file you customized | Take upstream fix; re-apply fork diff on top |
| Upstream refactors file you heavily forked | Merge upstream structure first, then re-implement fork features as smaller patches |
| Conflicting schema | New migration on fork; never rewrite old migrations |

## History

| Date | Notes |
| ---- | ----- |
| 2026-06-29 | Initial `FORK.md` — documents shipping labels, batch tracking, item packaging, inspection, quote parts, operation time basis, tool life, and merge workflow |
