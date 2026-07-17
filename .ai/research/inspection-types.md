# Inspection Types Research: Best Practices Survey

## Summary

Surveyed how SAP S/4HANA QM, Epicor Kinetic, 1factory, and High QA model inbound (goods receipt), lot/final (production goods receipt / FAI), and in-process inspections with SPC. Consensus: treat these as distinct inspection origins with separate stock relevance, plan assignment, and numbering/usage decisions; in-process is typically non-stock and operation-scoped; final/lot is stock-relevant at production GR; inbound is stock-relevant at PO receipt. Lot/final approval can be informed by in-process data but systems keep separate lots/runs rather than collapsing everything into one table.

## Competitors Surveyed

- **SAP S/4HANA QM** — enterprise reference for inspection lot origins, stock relevance, and production vs procurement inspection
- **Epicor Kinetic (EQA)** — discrete manufacturing ERP with receiving / in-process / final inspection plans and SPC data capture
- **1factory** — quality/SPC point solution: FAI, in-process frequency/AQL sampling, live Cpk/control charts
- **High QA** — ballooned inspection plans, FAI/lot reports, real-time SPC and gage management

## Key Consensus Patterns

### 1. Separate inspection origins / types
- **SAP**: Inspection lot origins 01/02 (procurement GR), 03 (in-process, not stock-relevant), 04 (GR from production, stock-relevant). Material master activates inspection types per origin.
- **Epicor**: Distinct inspection plans for receiving, in-process (linked to job operation), and final / FAI.
- **1factory / High QA**: Separate workflows for receiving, in-process, FAI, and lot inspection reports.
- **Rationale**: Different triggers, stock impact, and plan masters; mixing them confuses disposition and reporting.

### 2. Stock relevance differs by type
- **SAP**: Origin 03 in-process UD does not post stock; origin 04 / procurement GR lots post to inspection stock then unrestricted/blocked on usage decision.
- **Epicor**: Receiving/final dispositions affect inventory; in-process primarily captures process data / NCR.
- **Rationale**: In-process monitors the process; inbound/lot gate inventory availability.

### 3. Plans assigned per context
- **SAP**: In-process characteristics come from routing/recipe; GR inspections from inspection plan / material specification.
- **Epicor**: Plans assigned to part (receiving) or operation (in-process).
- **1factory**: Frequency-, AQL-, or capability-based sampling at manufacturing steps.
- **Rationale**: One item-wide plan cannot express receiving AQL vs every-N-pieces operation sampling.

### 4. In-process SPC is measurement-centric
- **1factory / High QA**: Live X-bar/R, I-MR, Cp/Cpk/Pp/Ppk, Western Electric alerts; gage ID on measurements.
- **Epicor EQA**: Stores attribute results for SPC export/analysis.
- **SAP**: SPC via quantitative characteristics in inspection plans.
- **Rationale**: Formal SPC needs immutable numeric observations with characteristic identity, not only boolean pass/fail steps.

### 5. Final / lot inspection vs FAI
- **SAP**: Production GR lot (04) at goods receipt; optional “early lot” at order release for combined in-process + stock-relevant recording.
- **1factory / High QA**: FAI (AS9102) is a special first-article package; lot inspection is ongoing production sampling/reporting.
- **Rationale**: FAI is a documentation mode; lot inspection is the recurring stock gate. Carbon’s job-completion lot maps to SAP origin 04 / Epicor final, not full AS9102 FAI (can reuse inspection documents later).

### 6. Interaction between in-process and final
- **SAP**: Can run both 03 and 04; recommends not duplicating early-04 with 03; early lot is one way to combine. Usage decisions remain per lot.
- **Point solutions**: In-process SPC informs process health; lot/FAI reports are separate submissions.
- **Rationale**: Prefer explicit dependency / gating rules over merging into a single lot.

## Answers to Research Questions

1. **What entities and status lifecycles?** — Inspection lot/run with origin/type; samples/results; usage decision / disposition; optional quality notification (NCR). Status typically open → results recorded → UD/disposition closed.
2. **How are inbound vs production GR vs in-process distinguished?** — By inspection lot origin / plan assignment / stock relevance (SAP, Epicor).
3. **When is the lot created?** — PO GR for inbound; order release or production GR for production; order release for classic in-process (SAP 03).
4. **Should lot approval depend on in-process?** — Systems keep separate lots; combined early GR is optional. Configurable hard-gate is a Carbon product choice, not universal SAP default.
5. **SPC requirements?** — Characteristic-level numeric results, subgroups, control/spec limits, capability indices, gage traceability (1factory, High QA).
6. **Industry terminology?** — Prefer **Inbound / Receiving Inspection**, **Lot / Final Inspection** (production GR), **In-Process Inspection** over inventing new names.

## Competitor-Specific Details

### SAP S/4HANA QM
- Origins 03 (in-process, routing characteristics, non-stock) vs 04 (production GR, inspection plan, stock-relevant).
- Procurement GR posts to inspection stock until usage decision.
- Early lot creation for order item creates stock-relevant 04 at release for combined recording.

### Epicor Kinetic
- EQA inspection plans with attributes, sampling, pass/fail; assignable to part or operation.
- Skip-lot for trusted suppliers on receiving.
- SPC fed from EQA data collection.

### 1factory
- Ballooned plans, FAI/PPAP, in-process frequency/AQL/Ppk sampling, live SPC and Cpk.

### High QA
- Ballooning, FAI + lot reports, real-time SPC, integrated gage/calibration management.

## Recommended Approach for Carbon

1. **Three types** matching SAP origins / Epicor plan contexts: Inbound (receipt), Lot (job completion / production GR), In-Process (operation-scoped, non-stock).
2. **Generic inspection header + subtype tables** (not more nullable columns on `inboundInspection`) — aligns with separate origins and cleaner FKs.
3. **Separate sequences** (`II` / `LI` / `IP`) like distinct document families elsewhere in Carbon.
4. **Per-type item policies** (require + sampling/plan) instead of one `requiresInspection`.
5. **Phase 1**: Split UI/routes for Receipt vs Job on current table; allocate `LI` for new job lots.
6. **In-Process later**: Formal runs from `inspectionDocument` features + production quantity/time triggers; keep MES boolean `Inspection` steps as lightweight checks; optional Lot Accept gate via explicit `inspectionDependency`.
7. **Stock**: Inbound/Lot hold tracked entities; In-Process does not own inventory disposition.

## Sources

- https://learning.sap.com/learning-journeys/configuring-sap-s-4hana-quality-management/describing-technical-settings-for-inspection-processing-with-orders
- https://learning.sap.com/learning-journeys/applying-sap-s-4hana-quality-management/executing-an-in-process-inspection_b4829228-b4aa-488a-9237-f50162062215
- https://learning.sap.com/learning-journeys/configuring-sap-s-4hana-quality-management/processing-of-inspection-lots-for-the-goods-receipt-for-the-production-order
- https://learning.sap.com/learning-journeys/configuring-sap-s-4hana-quality-management/executing-a-combined-in-process-and-goods-receipt-inspection-with-one-inspection-lot
- https://learning.sap.com/courses/applying-sap-s-4hana-quality-management/processing-inspections-at-good-receipt_bf84141a-43bd-4744-a9f8-988655750611
- https://teccweb.com/epicor-kinetic-quality-management-systems/
- https://www.erpresearch.com/erp/epicor-kinetic/quality-management
- https://tomerlin-erp.com/epicor-enhanced-quality-assurance/
- https://1factory.com/manufacturing-quality.html
- https://www.1factory.com/quality-academy/guide-first-article.html
- https://www.highqa.com/inspection-manager-360-core/
- https://www.highqa.com/production-data-collection/
