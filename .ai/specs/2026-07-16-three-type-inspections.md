# Three-Type Inspection Architecture

> Status: in-progress
> Author: Nicholas Turpin / Carbon Agent
> Date: 2026-07-16
> Research: [.ai/research/inspection-types.md](../research/inspection-types.md)

## TLDR

Split quality inspections into three first-class types—**Inbound** (PO receipt), **Lot** (job completion / production GR), and **In-Process** (operation-scoped SPC)—with separate Quality nav tabs and sequences. Phase 1 ships the Inbound vs Lot UI/route split on the current table and allocates `LI` for new job lots. Later phases migrate to a generic inspection header + subtypes and add In-Process runs with optional Lot gating.

## Problem Statement

Carbon stretched receipt-centric `inboundInspection` to also cover job-completion lots (`sourceType: Receipt | Job`). Both share the Inbound Inspections list, “Received By/At” labels, and the `II` sequence. Make-only items cannot enable inspection via the Buy-gated `requiresInspection` UI. In-Process/SPC is not modeled (MES boolean Inspection steps are unrelated). Job-lot creation is non-atomic with inventory availability.

## Proposed Solution

### Phases

1. **Phase 1 (this delivery):** Lot Inspections tab + routes; filter lists by `sourceType`; Job detail under `/quality/lot-inspections/:id`; redirect Job ids from inbound URLs; new `lotInspection` (`LI`) sequence for new job lots.
2. **Phase 2:** Additive generic `inspection` + subtype tables; backfill; cutover services; per-type item policies.
3. **Phase 3:** In-Process runs, production triggers, SPC surfaces, `inspectionDependency` on Lot Accept.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Long-term model | Generic header + Receipt/Lot/InProcess subtypes | SAP-style origins; avoid nullable fanout (research + codebase) |
| Phase 1 storage | Keep `inboundInspection`; filter by `sourceType` | Lowest churn; option B from product |
| Sequences | `II` inbound, `LI` lot (new), `IP` in-process (later seed) | Carbon document-family pattern; do not renumber history |
| Lot cardinality | One Lot inspection per job completion invocation that creates held output (today: per `create-inspection-lot` success); Phase 2 adds stable output-lot key | Matches current edge function; multi-receipt jobs deferred to Phase 2 |
| Lot ↔ In-Process gating | Configurable hard-block Accept when required prerequisites incomplete/failed (Phase 3) | Explicit dependencies; not implicit all-ops |
| Item config | Per-type require + plan (Phase 2); Phase 1 unchanged flags | Buy-only gate is a known bug for make lots |
| MES Inspection steps | Keep as lightweight boolean/file checks; formal In-Process is separate | Different semantics from SPC runs |
| Gauges on measurements | Optional Phase 3 for In-Process; not required Phase 1 | High QA/1factory pattern; gauges exist but unlinked |
| Multi-tenancy | Composite PK + companyId on new tables (Phase 2) | conventions-database |
| Permissions | Stay under `quality_*` | Features live in quality module |
| Job complete redirect | Stay on job (no auto-open lot) | Product option B |

## Data Model Changes

### Phase 1

```sql
-- Seed lotInspection sequence for every company (prefix LI, size 6).
-- create-inspection-lot uses getNextSequence(..., "lotInspection", ...).
-- Existing Job rows retain II… readable ids.
```

### Phase 2 (sketch — not applied in Phase 1)

```sql
CREATE TYPE "inspectionType" AS ENUM ('Inbound', 'Lot', 'InProcess');

CREATE TABLE "inspection" (
  "id" TEXT NOT NULL DEFAULT id('insp'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL, -- human readable
  "type" "inspectionType" NOT NULL,
  "itemId" TEXT NOT NULL,
  "status" "inboundInspectionStatus" NOT NULL DEFAULT 'Pending',
  -- sampling snapshot columns (as today) …
  PRIMARY KEY ("id", "companyId")
);

CREATE TABLE "inspectionReceipt" (
  "id" TEXT NOT NULL DEFAULT id('inspr'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "receiptLineId" TEXT NOT NULL,
  PRIMARY KEY ("id", "companyId")
);

CREATE TABLE "inspectionLot" (
  "id" TEXT NOT NULL DEFAULT id('inspl'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  -- future: outputLotKey for multi-completion
  PRIMARY KEY ("id", "companyId")
);

CREATE TABLE "inspectionInProcess" (
  "id" TEXT NOT NULL DEFAULT id('inspp'),
  "companyId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "jobOperationId" TEXT NOT NULL,
  PRIMARY KEY ("id", "companyId")
);

-- inspectionSample, inspectionSampleMeasurement, inspectionTrackedEntity,
-- inspectionDependency, nonConformanceInspection — migrate from inbound*
```

## API / Service Changes

### Phase 1

- `getInboundInspections(client, companyId, { sourceType, ... })` — `.eq("sourceType", sourceType)` when provided.
- Inbound list loader passes `sourceType: "Receipt"`; Lot list passes `"Job"`.
- Detail loaders shared logic; Job source redirects inbound URL → lot URL.
- Accept/reject/sample/partial action redirects use the active route family’s list path.
- `create-inspection-lot` allocates via `"lotInspection"` sequence.

## UI Changes

### Phase 1

- Nav: **Inbound Inspections** + **Lot Inspections** under Quality → Inspection.
- Paths: `/x/quality/lot-inspections`, `/x/quality/lot-inspections/:id` (+ sample/accept/reject/partial).
- Table props: title, detail path builder, Produced By/At for Lot.
- `InboundInspectionLotView`: configurable base path for disposition actions.

## Acceptance Criteria

### Phase 1

- [x] Inbound list shows only `sourceType = Receipt`
- [x] Lot Inspections list shows only `sourceType = Job`
- [x] Job lot detail/sample/accept/reject work under `/quality/lot-inspections/...`
- [x] Opening a Job lot via inbound URL redirects to lot URL
- [x] Receipt lots unchanged under inbound paths
- [x] New job lots get `LI…` readable ids; historical Job `II…` still open/dispose
- [x] Biome clean on touched files (apply migration + smoke in browser locally)

### Later phases

- [ ] Generic tables + cutover (Phase 2)
- [ ] In-Process tab + triggers + optional Lot Accept gate (Phase 3)

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Saved views keyed `inboundInspection` | Med | Lot tab uses distinct `table` id for saved views |
| Dual routes duplicating loaders | Med | Extract shared helpers; thin route wrappers |
| Sequence collision if LI configured poorly | Low | Seed distinct prefix; unique (readableId, companyId) |
| Job creation race / Available-before-hold | High | Documented; harden in Phase 2 (out of Phase 1) |

## Open Questions

> Resolved autonomously for implementation (user directed full plan execute). Distinguish from human grill answers.

- [x] Lot cardinality (one per job vs per completion batch) — **Autonomous:** Keep current create-inspection-lot semantics for Phase 1; Phase 2 adds stable output-lot key when multi-completion is required.
- [x] Lot ↔ In-Process gating strength — **Autonomous:** Configurable hard-block on Accept in Phase 3 via `inspectionDependency`; warn-only not default.
- [x] Per-type require flags — **Autonomous:** Phase 2; Phase 1 keeps `requiresInspection` / `itemSamplingPlan`.
- [x] MES Inspection steps vs formal In-Process — **Autonomous:** Keep MES steps lightweight; formal In-Process is a separate run model.
- [x] Gauge required on measurements — **Autonomous:** Optional Phase 3 for In-Process; not Phase 1.
- [x] Nav label — **Autonomous:** **Lot Inspections** (plural), matching Inbound Inspections.
- [x] Job-complete redirect — **Autonomous:** Stay on job (option B).

## Changelog

- 2026-07-16: Created from research + plan; Phase 1 implemented (Lot Inspections tab, LI sequence, source-aware routes)
