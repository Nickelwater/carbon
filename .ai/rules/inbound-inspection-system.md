---
paths:
  - "apps/erp/app/modules/quality/ui/InboundInspections/**"
  - "apps/erp/app/modules/quality/quality.{server,service,models}.ts"
  - "packages/database/supabase/migrations/*inbound-inspection*.sql"
  - "packages/database/supabase/migrations/*generic-inspection*.sql"
  - "packages/database/supabase/functions/post-receipt/index.ts"
  - "packages/database/supabase/functions/create-inspection-lot/index.ts"
---

# Inbound / Lot / In-Process Inspection System

Receiving- and production-side quality gate, unified onto one generic model
(Phase 2, `20260717170708_generic-inspection-model.sql`). When a receipt posts
(purchased items) or a job completion creates a held output lot (make items),
an inspection is created for items whose `itemInspectionPolicy` (or legacy
`requiresInspection`) requires it. Inspectors record per-sample pass/fail,
then disposition Accept / Reject / Partial.

## Three types, one header

`inspectionType` enum: **Inbound** (receipt line), **Lot** (job completion),
**InProcess** (operation-scoped SPC — table shell only, dormant until Phase 3;
see `.ai/specs/2026-07-16-three-type-inspections.md`).

- `inspection` (PK `("id", "companyId")`) — the generic header. `inspectionId`
  (human id), `type`, `itemId`/`itemReadableId`, `supplierId`, `lotSize`,
  sampling-plan snapshot (`samplingStandard`, `samplingPlanType`, `sampleSize`,
  `acceptanceNumber`, `rejectionNumber`, `aql`, `inspectionLevel`, `severity`,
  `codeLetter`), `status` (`inboundInspectionStatus`: Pending/In Progress/
  Passed/Failed/Partial), `dispositionedBy`/`dispositionedAt`,
  `locationId`/`storageUnitId` (snapshot for the reject ledger entry).
- `inspectionReceipt` — Inbound subtype: `receiptId`, `receiptLineId`
  (**unique** — one lot per received line).
- `inspectionLot` — Lot subtype: `jobId`, `jobOperationId`, `outputLotKey`
  (**unique** — idempotency key so a re-run of `create-inspection-lot` for the
  same completion doesn't create a second lot).
- `inspectionInProcess` — InProcess subtype shell: `jobId`, `jobOperationId`.
- `inspectionSample` / `inspectionSampleMeasurement` — one row per recorded
  result (`trackedEntityId` **nullable**; a *partial* unique index keeps a
  serial entity sampleable once while allowing many anonymous samples) and
  per-feature measurements.
- `inspectionHistory` — one row per disposition (skeleton for future plan
  auto-switching). `inspectionTrackedEntity` — explicit sampled/lot-entity
  links (preferred over scraping `trackedEntity.attributes` on newer rows).
- `inspectionDependency` — cross-inspection prerequisite edges (dormant until
  Phase 3's Lot ↔ In-Process gating).
- `nonConformanceInspection` — links an auto-created NCR back to the
  inspection (unique `(nonConformanceId, inspectionId)`); replaces
  `nonConformanceInboundInspection`.
- `itemInspectionPolicy` (unique `(itemId, companyId, inspectionType)`) — per
  item + type: `required`, sampling plan (`type`/`sampleSize`/`percentage`/
  `aql`/`inspectionLevel`/`severity`/`inspectionDocumentId`). Checked first;
  falls back to `item.requiresInspection` + `itemSamplingPlan` (Inbound-only,
  legacy) when no policy row exists.

RLS on all tables: standard SELECT/INSERT/UPDATE/DELETE gated by
`quality_view/create/update/delete`.

### Legacy tables — still readable, trigger-mirrored

`inboundInspection` / `inboundInspectionSample` / `inboundInspectionSampleMeasurement`
/ `inboundInspectionHistory` / `nonConformanceInboundInspection` are **not**
dropped. SQL triggers (`sync_*_to_generic` / `sync_*_to_inbound` in the Phase 2
migration) dual-write both directions so either side stays consistent during
the cutover. New code should read/write the generic tables; the legacy ones
exist for anything not yet migrated and for old saved views/readable ids.

## Sequences

`II` (Inbound, oldest), `LI` (Lot, added Phase 1), `IP` (In-Process, seeded
Phase 2 but unused until Phase 3 ships producers). New rows of each type
allocate from their own sequence via `getNextSequence`; historical Job rows
created before Phase 1 may still show `II…` readable ids.

## Producers

- **`post-receipt/index.ts`** (Supabase edge fn) — per receipt line whose item
  requires Inbound inspection (prefer `itemInspectionPolicy`, else
  `item.requiresInspection` + `itemSamplingPlan`) and `receivedQuantity > 0`:
  resolves the plan via `resolveSamplingPlan` (ANSI Z1.4 / ISO 2859-1 tables,
  `packages/database/supabase/functions/shared/sampling-engine.ts`), then
  inserts directly into `inspection` + `inspectionReceipt` (readable id from
  the `inboundInspection` sequence). Tracked entities for inspection-required
  items are set `"On Hold"` at receipt; everything else flips `Available`.
- **`create-inspection-lot/index.ts`** — invoked on job completion. Idempotent
  on `inspectionLot.outputLotKey`: if a lot already exists for the key,
  returns its `inspectionId`. Otherwise resolves the Lot policy
  (`itemInspectionPolicy` type=Lot, else legacy defaults), allocates a
  readable id from the `lotInspection` sequence, and inserts `inspection` +
  `inspectionLot` + `inspectionTrackedEntity` links, holding the output lot
  `"On Hold"` — all in one transaction (atomic with the inventory hold).

## Tracking types

All four `itemTrackingType` values support inspection (the only UI gate is
purchased items for Inbound — see Code map). Serial parts produce N tracked
entities and the inspector scans/selects a discrete entity per sample;
non-serial (Batch/Inventory/Non-Inventory) record pass/fail with
`trackedEntityId = NULL` (same UI, no scan). Inventory items that aren't
tracked have no per-row status to flip, so a Reject posts a compensating
`itemLedger` entry instead (see disposition).

## Code map (ERP)

- **Items toggle**: `apps/erp/app/modules/items/ui/{Parts,Materials,Tools,Consumables}/*Properties.tsx`
  render the `requiresInspection` checkbox only when `replenishmentSystem?.includes("Buy")` —
  legacy fallback; prefer the per-type `itemInspectionPolicy` editor.
- **Sampling plan editor**: `apps/erp/app/modules/quality/ui/SamplingPlan/SamplingPlanForm.tsx`,
  mounted on `routes/x+/{part,material,tool,consumable}+/$itemId.quality.tsx`.
- **Inspection detail drawer**: `.../ui/InboundInspections/InboundInspectionLotView.tsx` — progress,
  samples table, Accept/Reject/Partial. Branches on `isSerial = itemTrackingType === "Serial"`.
  Reject modal has an "Open an NCR" checkbox (`createNcr`, defaults on). When a linked
  inspection document has recorded measurement rows, the Measurements cell is expandable and
  shows the characteristic table (nominal / ± / unit / measured / In|Out).
- **Sample modal**: `.../ui/InboundInspections/ScanInspectionSample.tsx` — `isSerial` prop; serial
  shows Scan/Select tabs (entity required), non-serial shows just Notes + Pass/Fail.
- **Routes** `apps/erp/app/routes/x+/quality+/`:
  - `inbound-inspections.tsx` — list filtered `type = Inbound`
  - `lot-inspections.tsx` — list filtered `type = Lot` (Lot Inspections nav)
  - Detail/actions under both path families (`lot-inspections.$id.reject.tsx` re-exports the
    inbound route's `action`); Job ids opened under inbound URLs redirect to
    `/quality/lot-inspections/:id`. Shared detail loader:
    `ui/InboundInspections/loadInspectionLotDetail.server.ts`.
    Source-aware redirects/links go through `inspectionRouteFamily(sourceType)`.
- **Server** `quality.server.ts`:
  - `upsertInboundInspectionSample` — flips entity status + writes `trackedActivity` input/output
    only when `trackedEntityId` is present; anonymous (null) samples are always inserts (no dedupe).
    Writes the generic `inspectionSample`/`inspectionSampleMeasurement` tables.
  - `dispositionInboundInspection` — reads/writes the generic `inspection` + `inspectionReceipt`
    tables via Kysely. Accept releases un-sampled entities to Available; Reject flips all lot
    entities to Rejected (and for a non-tracked Inventory item posts an `itemLedger`
    `"Inspection"` negative adjustment — `"Inbound Inspection"` stays a valid enum value for
    reading rows written before Phase 2.5); Partial leaves entities; always writes
    `inspectionHistory`.
  - NCR auto-creation lives in the **reject route** (`inbound-inspections.$id.reject.tsx`),
    optional via `createNcr`, linking through `nonConformanceInspection`.
- **Service** `quality.service.ts`: `getInboundInspections`/`getInboundInspection` (legacy shape,
  generic tables underneath — see `normalizeInspectionRow`), `getInspections`/`getInspection`
  (generic shape, any `type`), `getInboundInspectionLotTrackedEntities`,
  `getItemInspectionPolicy(ies)` / `upsertItemInspectionPolicy`.
- **Validators** `quality.models.ts`: `inboundInspectionSampleValidator` (`trackedEntityId`
  optional), `itemSamplingPlanValidator`, `itemInspectionPolicyValidator`,
  `inboundInspectionDispositionValidator`.
- **NCR associations**: `quality.service.ts` `deleteIssueAssociation`/`getIssueAssociations` and
  `routes/x+/issue+/$id.association.new.tsx` keep the `"inboundInspections"` association-type key
  stable but read/write `nonConformanceInspection` + `inspection` underneath.
- **Traceability**: `trackedEntity.sourceDocument` writes `"Inspection"` (was `"Inbound Inspection"`
  pre-cutover); readers should accept both values on historical rows.

## Gotchas

- **Generic tables are the source of truth; legacy tables are a trigger-mirrored read path.**
  Don't hand-write to `inboundInspection*` from new code — write `inspection` + the matching
  subtype and let the trigger mirror it, or call the existing `quality.server.ts` helpers.
- **Inspection-required tracked entities post `On Hold`, not Available.** They are not on-hand
  until released by sampling/disposition.
- **`trackedEntityId` is nullable** on samples; serial uniqueness is enforced by a *partial* index.
- **`inspectionLot.outputLotKey` is the idempotency key** for `create-inspection-lot` — don't
  allocate a second lot for the same completion; check it first.
- **Don't confuse with inspection *documents*.** `inspectionDocument`/`inspectionFeature`/`balloon`
  + `save_inspection_document_atomic` are the first-article / ballooned-drawing feature — a
  separate system from this receiving/lot flow (though a policy can reference a document for
  its sampling plan).
