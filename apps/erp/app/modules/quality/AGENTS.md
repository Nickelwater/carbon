# Quality Module

Non-conformances (issues/NCRs), corrective/preventive actions (CAPAs), gauge management and calibration, quality documents, inspection documents with balloon annotations, inspections (source-generic: receipts and job operations) with AQL sampling plans, and risk registers.

## Key Domain Concepts

- **Issue (NCR)** — non-conformance record. Statuses: Registered → In Progress → Closed. `isIssueLocked(status)` returns true for Closed. Has 10+ association types (items, customers, suppliers, job operations, PO/SO lines, shipment/receipt lines, tracked entities, inspections).
- **Issue Workflow** — configurable multi-step workflow with action tasks (`nonConformanceActionTask`) and approval tasks (`nonConformanceApprovalTask`). Required actions have `systemType` (Containment, Corrective, Preventive, Verification, Communication) — system actions are protected by trigger.
- **Inspection Document** — PDF-based drawing with balloon annotations linking to inspection features (dimensions with nominal/tolerance values, optional per-feature sampling rules). Used for FAI, in-process inspection, and — via the item's Receipt-usage assignment — inbound inspection. MUST use `saveInspectionDocumentAtomic` RPC for atomic saves. Versioning (draft/active/archived, copy-from) is a fork-specific extension on top of the base document model — see `quality.service.ts`.
- **Inspection (generic, three types)** — a single `inspection` header table backs all three inspection types (`inspectionType`: Inbound/Lot/InProcess; upstream's parallel `sourceDocument`: Receipt/Job Operation), with a 1:1 subtype row (`inspectionReceipt`, `inspectionLot`, `inspectionInProcess` — shell only, dormant until Phase 3) carrying the type-specific FKs. **Inbound** (receipt-sourced, purchased items, `II` sequence) and **Lot** (job-completion, `LI` sequence) share the sample/disposition UI under Quality → Inbound/Lot Inspections; Job Operation lots can also be created lazily by the MES inspection view for operations with `operationType = 'Inspection'`. `itemInspectionPolicy` (per item + type: required, sampling plan) is the current source of truth, checked before the legacy `item.requiresInspection` + `itemSamplingPlan` fallback; upstream additionally resolves sampling **per feature** (feature rule → document default → All) via `itemInspectionDocumentAssignment`. Legacy `inboundInspection*` tables are kept in sync by DB triggers for backward compatibility — `getInboundInspection`/`getInboundInspections` still read the generic tables and normalize the shape back. Terminal statuses (Passed/Failed/Partial) are hard-terminal: the engine refuses sample/measurement writes on closed lots. See `.ai/rules/inbound-inspection-system.md`, `.ai/specs/2026-07-16-three-type-inspections.md` (In-Process is Phase 3), and `.claude/rules/inspection-system.md`.
- **Gauge** — measurement instrument with calibration tracking. Statuses: Active/Inactive. Roles: Master/Standard.
- **Disposition** — per-item outcome on an NCR. Values include Pending, Return to Supplier, Rework, Scrap, Use As Is (subset active in UI).
- **Risk Register** — risks and opportunities tracked by source (Customer, Supplier, Item, Job, etc.). Severity and likelihood are independent 1–5 ratings with no computed score.

## Safety

### Always
- MUST check `isIssueLocked(status)` before allowing edits — Closed issues are locked.
- MUST use `deleteIssueAssociation` with the `type` parameter for managing NCR links — it handles 10+ association types via `nonConformanceAssociationType`.
- MUST scope all queries by `companyId`.
- MUST use `saveInspectionDocumentAtomic` RPC for inspection document saves — it handles balloons and features atomically.

### Ask First
- Closing issues that have incomplete required actions or pending approval tasks.
- Deleting inspection documents that have recorded measurements.
- Deactivating gauges with active calibration records.

### Never
- Delete gauges with calibration records — deactivate instead (`deactivateGauge`).
- Bypass workflow task/approval requirements when closing an issue.
- Hard-delete issue workflows — use `deleteIssueWorkflow` which handles deactivation.
- Introduce a `score` column on risk register — severity and likelihood are kept separate by design.

## Validation Commands

```bash
pnpm --filter @carbon/erp typecheck
pnpm --filter @carbon/erp test
```

## Key Data Model

| Table / View | Purpose |
|---|---|
| `nonConformance` / `issues` (view) | Issue/NCR header: status, priority, source, type, assignee, containmentStatus |
| `nonConformanceType` / `nonConformanceWorkflow` | Issue categories and workflow definitions |
| `nonConformanceRequiredAction` | Actions required before closure (with `systemType`) |
| `nonConformanceActionTask` / `nonConformanceApprovalTask` | Workflow task instances |
| `nonConformanceItem` | Issue-to-item junction with `disposition` |
| `nonConformanceCustomer` / `...Supplier` / `...JobOperation` / `...PurchaseOrderLine` / `...ReceiptLine` / `...ShipmentLine` / `...TrackedEntity` / `...Inspection` | Association tables (10+ types); `nonConformanceInspection` replaces legacy `nonConformanceInboundInspection`, which is trigger-mirrored |
| `inspectionDocument` | PDF drawing with balloon overlay |
| `inspection` | Generic inspection header (Inbound/Lot/InProcess) — `inspectionId` readable id, sampling-plan snapshot, `status`/disposition, live `inspectionDocumentId` + `sourceDocument*` columns |
| `inspectionReceipt` / `inspectionLot` / `inspectionInProcess` | 1:1 subtype rows: receipt+line (Inbound), job+operation (Lot), job+operation shell (InProcess, dormant) |
| `inspectionSample` / `inspectionSampleMeasurement` | Per-sample result + per-feature measurements (generic; replaces `inboundInspectionSample*`) |
| `inspectionSamplingPlan` / `inspectionMeasurement` | Per-inspection resolved feature plans (n/Ac/Re) and per sample × feature readings |
| `inspectionHistory` / `inspectionTrackedEntity` / `inspectionDependency` | Disposition history, sampled-entity links, cross-inspection prerequisites (dormant until Phase 3) |
| `itemInspectionPolicy` | Per item + `inspectionType` policy (required, sampling plan) — supersedes `item.requiresInspection` / `itemSamplingPlan` |
| `itemInspectionDocumentAssignment` | Item × usage slot → inspection document (v1 usage: `Receipt`) |
| `inboundInspection` / `inboundInspectionSample` / `inboundInspectionHistory` / `nonConformanceInboundInspection` | Legacy Inbound-only tables, still readable — kept mirrored by DB triggers off `inspection`/subtypes |
| `itemSamplingPlan` | AQL sampling plan per item (Inbound; legacy fallback when no `itemInspectionPolicy` row) |
| `gauge` / `gaugeCalibrationRecord` / `gaugeType` | Measurement instrument tracking |
| `qualityDocument` / `qualityDocumentStep` | Versioned SOPs with ordered steps |
| `riskRegister` / `riskRegisters` (view) | Risk/opportunity tracking by source |

## Key Service Functions

- `getIssue` / `getIssues` — NCR reads; `getIssues` reads `issues` view with computed `containmentStatus`
- `getIssueAssociations` / `getIssueItems` / `getIssueReviewers` — NCR details and associations
- `getIssueWorkflow` / `getIssueActionTasks` / `getIssueApprovalTasks` — workflow state
- `updateIssueStatus` / `updateIssueTaskStatus` — status transitions
- `getInspectionDocument` / `getBalloons` / `getInspectionFeatures` / `getInspectionPlan` — drawing-inspection reads, including the fork's versioning support (`quality.service.ts`); a simpler non-versioned copy also lives in `production.service.ts` for upstream's `production/ui/InspectionDocument` UI
- `getInboundInspection` / `getInboundInspections` / `getInboundInspectionLotTrackedEntities` — legacy-shaped reads over the generic `inspection` tables (kept as the public/MCP names for stability)
- `getInspection` / `getInspections` — generic-shaped reads (any type); pass `type: "Inbound" | "Lot" | "InProcess"` and/or `source` to filter
- `getInspectionSamplingPlans` / `getInspectionMeasurements` — per-inspection feature plans and grid readings
- `getItemInspectionPolicy` / `getItemInspectionPolicies` / `upsertItemInspectionPolicy` — per item + type inspection policy
- `getItemInspectionDocumentAssignments` / `upsertItemInspectionDocumentAssignment` — Receipt-usage document assignment
- `dispositionInboundInspection` / `upsertInboundInspectionSample` (quality.server.ts) — fork's batch-lot + Phase 3.5 dependency-gated disposition/sampling
- `upsertInspectionSample` / `dispositionInspection` / `upsertInspectionMeasurement` / `reconcileInspectionSamplingPlans` / `changeInspectionDocument` / `valuateMeasurement` (quality.server.ts) — thin wrappers over the shared transactional engine in `@carbon/database/quality` (shared with the MES inspection routes)
- `getGauge` / `getGauges` / `getGaugeCalibrationRecords` — gauge management
- `getRisk` / `getRisks` / `upsertRisk` / `updateRiskStatus` — risk register
- `getQualityDocument` / `getQualityDocumentSteps` — versioned SOPs
- `getQualityActions` — corrective/preventive action reads

## Key Exports

```typescript
import { getIssue, getIssues, upsertRisk, isIssueLocked } from "~/modules/quality";
import { nonConformanceStatus, riskSource, disposition } from "~/modules/quality";
import { inspectionDocumentValidator, riskRegisterValidator } from "~/modules/quality";
```

## Related Modules

- **inventory** — inbound inspections triggered on receipt; tracked entities linked to NCRs; `On Hold` status until disposition
- **production** — job operations can be NCR associations; scrap reasons shared with production
- **purchasing** — PO lines and receipt lines can be NCR associations; supplier NCRs
- **sales** — SO lines and shipment lines can be NCR associations; customer NCRs
- **items** — items linked to NCRs via `nonConformanceItem`; inbound inspection driven by the item's Receipt-usage inspection-document assignment; inspection documents reference parts

## Rules References

- `.claude/rules/issue-module.md` — NCR status lifecycle, workflow tasks, associations, and route structure
- `.claude/rules/risk-register-module.md` — risk register schema, enums, and entity integration
- `.claude/rules/inspection-system.md` — inspection execution flow, sampling engine, and disposition
