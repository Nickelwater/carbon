/**
 * ERP bindings for the shared inspection execution engine
 * (@carbon/database/quality). The engine moved there so the MES inspection
 * routes can run the same transactional core; these wrappers keep the ERP
 * call sites unchanged by currying in the ERP Kysely singleton.
 */
import * as engine from "@carbon/database/quality";
import { errResult, valuateMeasurement } from "@carbon/database/quality";
import { sql } from "kysely";
import type { z } from "zod";

import { getDatabaseClient } from "~/services/database.server";
import {
  computeSampleAutoStatus,
  evaluateCharacteristicMeasurement,
  parseNumericMeasurement
} from "./evaluateCharacteristicMeasurement";
import {
  resolveGaugeCalibrationStatus,
  validateGaugeForMeasurement
} from "./gaugeValidation";
import {
  nextSampleIndex,
  resolveDispositionFlip,
  resolveRejectLedgerLocation
} from "./inspectionDisposition";
import { isBatchInspectionLot } from "./inspectionLot.utils";
import type {
  inboundInspectionSampleValidator,
  inspectionDispositionValidator,
  inspectionMeasurementValidator,
  inspectionSampleValidator
} from "./quality.models";

export type { Result } from "@carbon/database/quality";
export { errResult, valuateMeasurement };

// Mirrors the old in-service helper. Terminal states (Passed/Failed/Partial)
// are owned by the disposition path, so the per-sample recompute only flips
// between Pending and In Progress.
function computeLotStatus(
  samples: { status: string }[]
): "Pending" | "In Progress" {
  const inspected = samples.filter((s) => s.status !== "Pending").length;
  return inspected > 0 ? "In Progress" : "Pending";
}

type ResolvedSampleStatus = {
  status: "Passed" | "Failed";
  statusOverridden: boolean;
  measurements: Array<{
    inspectionFeatureId: string;
    measuredValue: string | null;
    inTolerance: boolean | null;
  }>;
};

async function resolveInboundSampleStatus(
  trx: any,
  sample: z.infer<typeof inboundInspectionSampleValidator> & {
    companyId: string;
  },
  inspectionDocumentId: string | null
): Promise<ResolvedSampleStatus> {
  if (!inspectionDocumentId || !sample.measurements?.length) {
    return {
      status: sample.statusOverride ?? sample.status,
      statusOverridden: false,
      measurements: []
    };
  }

  const features = await trx
    .selectFrom("inspectionFeature")
    .select(["id", "nominalValue", "tolerancePlus", "toleranceMinus", "unit"])
    .where("inspectionDocumentId", "=", inspectionDocumentId)
    .execute();

  const featureById = new Map(features.map((f) => [f.id, f]));
  const evaluations: Array<{ inTolerance: boolean | null }> = [];
  const measurements: ResolvedSampleStatus["measurements"] = [];

  for (const measurement of sample.measurements) {
    const feature = featureById.get(measurement.inspectionFeatureId);
    if (!feature) continue;

    const { inTolerance } = evaluateCharacteristicMeasurement({
      nominalValue: feature.nominalValue,
      tolerancePlus: feature.tolerancePlus,
      toleranceMinus: feature.toleranceMinus,
      measuredValue: measurement.measuredValue
    });
    evaluations.push({ inTolerance });
    measurements.push({
      inspectionFeatureId: measurement.inspectionFeatureId,
      measuredValue: measurement.measuredValue?.trim()
        ? measurement.measuredValue.trim()
        : null,
      inTolerance
    });
  }

  const autoStatus = computeSampleAutoStatus(evaluations);
  const finalStatus = sample.statusOverride ?? autoStatus ?? sample.status;
  const statusOverridden =
    sample.statusOverride != null &&
    autoStatus != null &&
    sample.statusOverride !== autoStatus;

  return {
    status: finalStatus,
    statusOverridden,
    measurements
  };
}

// -------------------------------------------------------------
// 1. upsertInboundInspectionSample
// -------------------------------------------------------------
// Writes that must stay consistent (all against the generic `inspection*`
// tables — dual-write SQL triggers mirror inserts/updates back onto the
// legacy `inboundInspection*` tables for anything still reading those):
//   - inspectionSample (insert or update; batch lots allow multiple rows)
//   - inspectionSampleMeasurement (measuredValue text + measuredValueNumeric)
//   - inspectionTrackedEntity (link the sampled entity for disposition lookups)
//   - trackedEntity.status (serial: flip per sample; batch: only on disposition)
//   - trackedActivity + trackedActivityInput + trackedActivityOutput
//   - inspection.status (recompute if non-terminal)

export async function upsertInboundInspectionSample(
  sample: z.infer<typeof inboundInspectionSampleValidator> & {
    companyId: string;
    inspectedBy: string;
  }
): Promise<Result<{ id: string }>> {
  const db = getDatabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const result = await db.transaction().execute(async (trx) => {
      const inspection = await trx
        .selectFrom("inspection")
        .leftJoin("inspectionReceipt", (join) =>
          join
            .onRef("inspectionReceipt.inspectionId", "=", "inspection.id")
            .onRef("inspectionReceipt.companyId", "=", "inspection.companyId")
        )
        .select([
          "inspection.id",
          "inspection.status",
          "inspection.sampleSize",
          "inspection.inspectionDocumentId",
          "inspectionReceipt.receiptId"
        ])
        .where("inspection.id", "=", sample.inspectionId)
        .where("inspection.companyId", "=", sample.companyId)
        .executeTakeFirst();
      if (!inspection) throw new Error("Inspection not found");

      const trackedEntityId = sample.trackedEntityId || null;

      const resolved = await resolveInboundSampleStatus(
        trx,
        sample,
        inspection.inspectionDocumentId ?? null
      );

      const samplePayload = {
        inspectionId: sample.inspectionId,
        trackedEntityId,
        status: resolved.status,
        statusOverridden: resolved.statusOverridden,
        notes: sample.notes ?? null,
        inspectedBy: sample.inspectedBy,
        inspectedAt: nowIso,
        companyId: sample.companyId
      };

      let sampleId: string;
      let isBatchEntity = false;

      if (!trackedEntityId) {
        const inserted = await trx
          .insertInto("inspectionSample")
          .values({
            ...samplePayload,
            createdBy: sample.inspectedBy
          } as any)
          .returning(["id"])
          .executeTakeFirstOrThrow();
        sampleId = inserted.id;
      } else {
        const trackedEntity = await trx
          .selectFrom("trackedEntity")
          .select(["id", "quantity"])
          .where("id", "=", trackedEntityId)
          .where("companyId", "=", sample.companyId)
          .executeTakeFirst();
        if (!trackedEntity) throw new Error("Tracked entity not found");

        isBatchEntity = Number(trackedEntity.quantity ?? 1) > 1;

        // Link the sampled entity to the inspection so disposition can
        // resolve the lot's tracked entities without scraping attributes.
        await trx
          .insertInto("inspectionTrackedEntity")
          .values({
            inspectionId: sample.inspectionId,
            trackedEntityId,
            companyId: sample.companyId,
            createdBy: sample.inspectedBy
          })
          .onConflict((oc) =>
            oc
              .columns(["inspectionId", "trackedEntityId", "companyId"])
              .doNothing()
          )
          .execute();

        if (isBatchEntity) {
          const [totalRow, entityRow] = await Promise.all([
            trx
              .selectFrom("inspectionSample")
              .select(({ fn }) => fn.count<number>("id").as("count"))
              .where("inspectionId", "=", sample.inspectionId)
              .executeTakeFirst(),
            trx
              .selectFrom("inspectionSample")
              .select(({ fn }) => fn.count<number>("id").as("count"))
              .where("inspectionId", "=", sample.inspectionId)
              .where("trackedEntityId", "=", trackedEntityId)
              .executeTakeFirst()
          ]);

          if (Number(totalRow?.count ?? 0) >= inspection.sampleSize) {
            throw new Error(
              "The required number of samples has already been recorded for this lot"
            );
          }

          const sampleIndex = nextSampleIndex({
            existingCountForEntity: Number(entityRow?.count ?? 0)
          });

          const inserted = await trx
            .insertInto("inspectionSample")
            .values({
              ...samplePayload,
              sampleIndex,
              createdBy: sample.inspectedBy
            } as any)
            .returning(["id"])
            .executeTakeFirstOrThrow();
          sampleId = inserted.id;
        } else {
          const existing = await trx
            .selectFrom("inspectionSample")
            .select(["id"])
            .where("inspectionId", "=", sample.inspectionId)
            .where("trackedEntityId", "=", trackedEntityId)
            .executeTakeFirst();

          if (existing) {
            const updated = await trx
              .updateTable("inspectionSample")
              .set({
                ...samplePayload,
                updatedBy: sample.inspectedBy,
                updatedAt: nowIso
              })
              .where("id", "=", existing.id)
              .returning(["id"])
              .executeTakeFirstOrThrow();
            sampleId = updated.id;
          } else {
            const inserted = await trx
              .insertInto("inspectionSample")
              .values({
                ...samplePayload,
                sampleIndex: 1,
                createdBy: sample.inspectedBy
              } as any)
              .returning(["id"])
              .executeTakeFirstOrThrow();
            sampleId = inserted.id;
          }

          const trackedEntityStatus =
            resolved.status === "Passed" ? "Available" : "Rejected";
          await trx
            .updateTable("trackedEntity")
            .set({ status: trackedEntityStatus })
            .where("id", "=", trackedEntityId)
            .where("companyId", "=", sample.companyId)
            .execute();
        }
      }

      if (resolved.measurements.length > 0) {
        // No delete-sync trigger exists from generic → legacy, so a re-submit
        // that drops a feature (rare — inspection plan changed mid-lot) will
        // leave a stale row in the legacy `inboundInspectionSampleMeasurement`
        // table. Acceptable for Phase 2.3 since reads now come from the
        // generic table; revisit once legacy tables are retired (Phase 2.5).
        await trx
          .deleteFrom("inspectionSampleMeasurement")
          .where("inspectionSampleId", "=", sampleId)
          .execute();

        await trx
          .insertInto("inspectionSampleMeasurement")
          .values(
            resolved.measurements.map((measurement) => ({
              inspectionSampleId: sampleId,
              inspectionFeatureId: measurement.inspectionFeatureId,
              measuredValue: measurement.measuredValue,
              measuredValueNumeric: parseNumericMeasurement(
                measurement.measuredValue
              ),
              inTolerance: measurement.inTolerance,
              companyId: sample.companyId,
              createdBy: sample.inspectedBy
            }))
          )
          .execute();
      }

      if (trackedEntityId) {
        const activity = await trx
          .insertInto("trackedActivity")
          .values({
            type: "Inspect",
            sourceDocument: "Inspection",
            sourceDocumentId: sample.inspectionId,
            attributes: {
              Result: resolved.status,
              Inspector: sample.inspectedBy,
              ...(inspection.receiptId
                ? { Receipt: inspection.receiptId }
                : {}),
              ...(isBatchEntity ? { "Sample Unit": 1 } : {}),
              ...(sample.notes ? { Notes: sample.notes } : {})
            },
            companyId: sample.companyId,
            createdBy: sample.inspectedBy
          })
          .returning(["id"])
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("trackedActivityInput")
          .values({
            trackedActivityId: activity.id,
            trackedEntityId,
            quantity: isBatchEntity ? 1 : 0,
            companyId: sample.companyId,
            createdBy: sample.inspectedBy
          })
          .execute();
        await trx
          .insertInto("trackedActivityOutput")
          .values({
            trackedActivityId: activity.id,
            trackedEntityId,
            quantity: isBatchEntity ? 1 : 0,
            companyId: sample.companyId,
            createdBy: sample.inspectedBy
          })
          .execute();
      }

      const isTerminal =
        inspection.status === "Passed" ||
        inspection.status === "Failed" ||
        inspection.status === "Partial";
      if (!isTerminal) {
        const samples = await trx
          .selectFrom("inspectionSample")
          .select(["status"])
          .where("inspectionId", "=", sample.inspectionId)
          .execute();
        const nextStatus = computeLotStatus(samples);
        if (nextStatus !== inspection.status) {
          await trx
            .updateTable("inspection")
            .set({
              status: nextStatus,
              updatedBy: sample.inspectedBy,
              updatedAt: nowIso
            })
            .where("id", "=", sample.inspectionId)
            .where("companyId", "=", sample.companyId)
            .execute();
        }
      }

      return { id: sampleId };
    });

    return { data: result, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to save sample"
    );
  }
}

// -------------------------------------------------------------
// 2. dispositionInboundInspection
// -------------------------------------------------------------
// Writes (generic tables; dual-write triggers mirror onto legacy tables):
//   - trackedEntity.status (bulk flip for Accept/Reject; nothing for Partial)
//   - inspection (status, dispositionedBy/At, notes)
//   - inspectionHistory (1 row for future plan auto-switching)

export async function dispositionInboundInspection(
  args: z.infer<typeof inspectionDispositionValidator> & {
    companyId: string;
    dispositionedBy: string;
  }
): Promise<Result<{ id: string; status: string }>> {
  const db = getDatabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const result = await db.transaction().execute(async (trx) => {
      const inspection = await trx
        .selectFrom("inspection")
        .leftJoin("inspectionReceipt", (join) =>
          join
            .onRef("inspectionReceipt.inspectionId", "=", "inspection.id")
            .onRef("inspectionReceipt.companyId", "=", "inspection.companyId")
        )
        .select([
          "inspection.id",
          "inspection.itemId",
          "inspection.status",
          "inspection.type",
          "inspection.supplierId",
          "inspection.samplingStandard",
          "inspection.severity",
          "inspection.inspectionLevel",
          "inspection.aql",
          "inspection.lotSize",
          "inspection.sampleSize",
          "inspection.locationId",
          "inspectionReceipt.receiptLineId"
        ])
        .where("inspection.id", "=", args.id)
        .where("inspection.companyId", "=", args.companyId)
        .executeTakeFirst();
      if (!inspection) throw new Error("Inspection not found");

      // Phase 3.5: Lot Accept is gated on required In-Process prerequisites.
      // Blocks (transactionally, before any writes) unless every required
      // dependency is Satisfied/Waived/Cancelled.
      if (args.decision === "Accept" && inspection.type === "Lot") {
        const anyTrx = trx as any;
        const blockingDependencies: any[] = await anyTrx
          .selectFrom("inspectionDependency")
          .select(["id", "status", "prerequisiteInspectionId"])
          .where("dependentInspectionId", "=", args.id)
          .where("companyId", "=", args.companyId)
          .where("required", "=", true)
          .where("status", "in", ["Pending", "Failed"])
          .execute();

        if (blockingDependencies.length > 0) {
          throw new Error(
            JSON.stringify({
              message: "Required In-Process inspection(s) not yet satisfied",
              blockers: blockingDependencies.map((row) => ({
                dependencyId: row.id,
                status: row.status,
                prerequisiteInspectionId: row.prerequisiteInspectionId
              }))
            })
          );
        }
      }

      const item = await trx
        .selectFrom("item")
        .select(["itemTrackingType"])
        .where("id", "=", inspection.itemId)
        .where("companyId", "=", args.companyId)
        .executeTakeFirst();

      // Snapshotted at receipt/lot-creation time (see resolveRejectLedgerLocation);
      // receiptLine is only a fallback for rows created before the snapshot existed.
      const receiptLine = inspection.receiptLineId
        ? await trx
            .selectFrom("receiptLine")
            .select(["locationId"])
            .where("id", "=", inspection.receiptLineId)
            .where("companyId", "=", args.companyId)
            .executeTakeFirst()
        : undefined;

      // Prefer the explicit inspectionTrackedEntity links recorded while
      // sampling; fall back to attribute scraping for lots that predate
      // that table (or whose entities were never individually sampled).
      const linkedEntities = await trx
        .selectFrom("inspectionTrackedEntity")
        .innerJoin(
          "trackedEntity",
          "trackedEntity.id",
          "inspectionTrackedEntity.trackedEntityId"
        )
        .select(["trackedEntity.id", "trackedEntity.quantity"])
        .where("inspectionTrackedEntity.inspectionId", "=", args.id)
        .where("inspectionTrackedEntity.companyId", "=", args.companyId)
        .execute();

      let lotEntities = linkedEntities;

      if (lotEntities.length === 0) {
        lotEntities = await trx
          .selectFrom("trackedEntity")
          .select(["id", "quantity"])
          .where(sql<string>`attributes ->> 'Inspection Lot'`, "=", args.id)
          .where("companyId", "=", args.companyId)
          .execute();
      }

      if (lotEntities.length === 0 && inspection.receiptLineId) {
        lotEntities = await trx
          .selectFrom("trackedEntity")
          .select(["id", "quantity"])
          .where(
            sql<string>`attributes ->> 'Receipt Line'`,
            "=",
            inspection.receiptLineId
          )
          .where("companyId", "=", args.companyId)
          .execute();
      }

      const batchLot = isBatchInspectionLot(lotEntities);

      const existingSamples = await trx
        .selectFrom("inspectionSample")
        .select(["trackedEntityId", "status"])
        .where("inspectionId", "=", args.id)
        .execute();

      const sampledIds = new Set(existingSamples.map((s) => s.trackedEntityId));
      const allLotIds = lotEntities.map((e) => e.id);
      const unsampledIds = allLotIds.filter((id) => !sampledIds.has(id));
      const failures = existingSamples.filter(
        (s) => s.status === "Failed"
      ).length;

      const { lotStatus, idsToFlip, flipStatus } = resolveDispositionFlip({
        decision: args.decision,
        batchLot,
        allLotIds,
        unsampledIds
      });

      if (flipStatus && idsToFlip.length > 0) {
        await trx
          .updateTable("trackedEntity")
          .set({ status: flipStatus })
          .where("id", "in", idsToFlip)
          .where("companyId", "=", args.companyId)
          .execute();
      }

      // Non-tracked (Inventory) items have no tracked entities to flip, so the
      // received quantity sits in itemLedger with no per-row status to exclude
      // it from on-hand. Rejecting the lot must post a compensating
      // Negative Adjmt. to reverse the full received quantity. Tracked items
      // are already handled by the status flip above; Non-Inventory items never
      // posted a ledger entry at receipt, so neither needs this.
      if (
        args.decision === "Reject" &&
        inspection.status !== "Failed" &&
        item?.itemTrackingType === "Inventory" &&
        inspection.lotSize > 0
      ) {
        const ledgerLocationId = resolveRejectLedgerLocation({
          inspectionLocationId: inspection.locationId,
          receiptLineLocationId: receiptLine?.locationId
        });

        await trx
          .insertInto("itemLedger")
          .values({
            itemId: inspection.itemId,
            locationId: ledgerLocationId,
            entryType: "Negative Adjmt.",
            // Phase 2.5 added "Inspection" to itemLedgerDocumentType so Inbound
            // and Lot inspections (both post through the generic `inspection`
            // table now) share one label; "Inbound Inspection" stays on the enum
            // only so older ledger rows keep reading. `as any` because the
            // generated Kysely types won't include the new literal until
            // `pnpm db:migrate` (this migration) + `generate:types` have run.
            documentType: "Inspection" as any,
            documentId: inspection.id,
            quantity: -inspection.lotSize,
            trackedEntityId: null,
            companyId: args.companyId,
            createdBy: args.dispositionedBy,
            comment: "Inbound inspection lot rejected"
          })
          .execute();
      }

      const updated = await trx
        .updateTable("inspection")
        .set({
          status: lotStatus,
          notes: args.notes ?? null,
          dispositionedBy: args.dispositionedBy,
          dispositionedAt: nowIso,
          updatedBy: args.dispositionedBy,
          updatedAt: nowIso
        })
        .where("id", "=", args.id)
        .where("companyId", "=", args.companyId)
        .returning(["id", "status"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("inspectionHistory")
        .values({
          inspectionId: args.id,
          itemId: inspection.itemId,
          supplierId: inspection.supplierId ?? null,
          samplingStandard: inspection.samplingStandard,
          severity: inspection.severity ?? "Normal",
          inspectionLevel: inspection.inspectionLevel ?? null,
          aql: inspection.aql ?? null,
          lotSize: inspection.lotSize,
          sampleSize: inspection.sampleSize,
          defectsFound: failures,
          outcome:
            args.decision === "Accept"
              ? "Accepted"
              : args.decision === "Reject"
                ? "Rejected"
                : "Partial",
          companyId: args.companyId,
          createdBy: args.dispositionedBy
        })
        .execute();

      return { id: updated.id, status: updated.status };
    });

    return { data: result, error: null };
  } catch (err) {
    if (err instanceof Error) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.blockers) {
          return errResult(parsed.message, parsed.blockers);
        }
      } catch {
        // Not a structured blocker error — fall through to the plain message.
      }
    }
    return errResult(
      err instanceof Error ? err.message : "Failed to disposition inspection"
    );
  }
}

// -------------------------------------------------------------
// Shared inspection-execution engine bindings (@carbon/database/quality).
// New generic-inspection call sites (e.g. MES parity routes) use these thin
// wrappers directly; the fork's legacy Accept/Reject/Partial routes above
// keep calling `dispositionInboundInspection`/`upsertInboundInspectionSample`
// for their richer batch-lot/dependency-gating behavior.
// -------------------------------------------------------------

export async function upsertInspectionSample(
  sample: z.infer<typeof inspectionSampleValidator> & {
    companyId: string;
    inspectedBy: string;
  }
) {
  return engine.upsertInspectionSample(getDatabaseClient(), sample);
}

export async function dispositionInspection(
  args: z.infer<typeof inspectionDispositionValidator> & {
    companyId: string;
    dispositionedBy: string;
  } & Pick<engine.InspectionDispositionInput, "requireOpen" | "requireSource">
) {
  return engine.dispositionInspection(getDatabaseClient(), args);
}

export async function upsertInspectionMeasurement(
  args: z.infer<typeof inspectionMeasurementValidator> & {
    companyId: string;
    userId: string;
  }
) {
  return engine.upsertInspectionMeasurement(getDatabaseClient(), args);
}

export async function reconcileInspectionSamplingPlans(
  inspectionId: string,
  companyId: string
) {
  return engine.reconcileInspectionSamplingPlans(
    getDatabaseClient(),
    inspectionId,
    companyId
  );
}

export async function changeInspectionDocument(args: {
  inspectionId: string;
  inspectionDocumentId: string | null;
  companyId: string;
  userId: string;
}) {
  return engine.changeInspectionDocument(getDatabaseClient(), args);
}

// -------------------------------------------------------------
// 5. recordInProcessInspectionSample
// -------------------------------------------------------------
// Records one sample + its feature measurements against an In-Process
// inspection run. Validates gauge requirements per numeric feature (see
// gaugeValidation.ts), computes per-measurement tolerance + sample status,
// and rolls the outcome up to the inspection header (Passed once
// samplesPerRun samples have passed; Failed on the first failing sample) and
// any inspectionDependency rows that gate a Lot Accept on this run.

export async function recordInProcessInspectionSample(args: {
  inspectionId: string;
  measurements: Array<{
    inspectionFeatureId: string;
    measuredValue: string | null;
    gaugeId?: string | null;
    gaugeOverride?: boolean;
    gaugeOverrideReason?: string | null;
  }>;
  notes?: string | null;
  companyId: string;
  userId: string;
}): Promise<
  Result<{ sampleId: string; status: string; inspectionStatus: string }>
> {
  const { inspectionId, measurements, companyId, userId } = args;
  if (measurements.length === 0) {
    return errResult("At least one measurement is required");
  }

  const db = getDatabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const result = await db.transaction().execute(async (trx) => {
      const anyTrx = trx as any;
      const inspectionHeader = await anyTrx
        .selectFrom("inspection")
        .select(["id", "status", "type"])
        .where("id", "=", inspectionId)
        .where("companyId", "=", companyId)
        .executeTakeFirst();

      if (!inspectionHeader || inspectionHeader.type !== "InProcess") {
        throw new Error("In-Process inspection not found");
      }

      const inProcessRow = await anyTrx
        .selectFrom("inspectionInProcess")
        .select(["samplesPerRun"])
        .where("inspectionId", "=", inspectionId)
        .where("companyId", "=", companyId)
        .executeTakeFirst();

      const inspection = {
        ...inspectionHeader,
        samplesPerRun: inProcessRow?.samplesPerRun ?? 1
      };
      if ((inspection as any).status === "Cancelled") {
        throw new Error("Cannot record samples against a cancelled run");
      }

      const featureIds = measurements.map((m) => m.inspectionFeatureId);
      const features: Array<{
        id: string;
        nominalValue: string | null;
        tolerancePlus: string | null;
        toleranceMinus: string | null;
      }> = await (trx as any)
        .selectFrom("inspectionFeature")
        .select(["id", "nominalValue", "tolerancePlus", "toleranceMinus"])
        .where("id", "in", featureIds)
        .where("companyId", "=", companyId)
        .execute();
      const featureById = new Map(
        features.map((f) => [f.id, f] as [string, (typeof features)[number]])
      );

      const gaugeIds = [
        ...new Set(
          measurements.map((m) => m.gaugeId).filter((id): id is string => !!id)
        )
      ];
      const gauges =
        gaugeIds.length > 0
          ? await trx
              .selectFrom("gauge")
              .select([
                "id",
                "gaugeStatus",
                "gaugeCalibrationStatus",
                "nextCalibrationDate"
              ])
              .where("id", "in", gaugeIds)
              .where("companyId", "=", companyId)
              .execute()
          : [];
      const gaugeById = new Map(gauges.map((g) => [g.id, g]));

      const evaluations = measurements.map((m) => {
        const feature = featureById.get(m.inspectionFeatureId);
        if (!feature) {
          throw new Error(
            `Inspection feature ${m.inspectionFeatureId} not found`
          );
        }

        const gaugeOverride = m.gaugeOverride ?? false;
        const gaugeRow = m.gaugeId ? (gaugeById.get(m.gaugeId) ?? null) : null;

        const validation = validateGaugeForMeasurement({
          nominalValue: feature.nominalValue,
          gaugeId: m.gaugeId ?? null,
          gaugeOverride,
          gaugeOverrideReason: m.gaugeOverrideReason ?? null,
          gauge: gaugeRow
            ? {
                gaugeStatus: gaugeRow.gaugeStatus,
                calibrationStatus: resolveGaugeCalibrationStatus({
                  gaugeCalibrationStatus: gaugeRow.gaugeCalibrationStatus,
                  nextCalibrationDate: gaugeRow.nextCalibrationDate
                })
              }
            : null
        });

        if (!validation.ok) {
          throw new Error(
            JSON.stringify({
              message: validation.reason,
              blockers: [
                {
                  inspectionFeatureId: m.inspectionFeatureId,
                  reason: validation.reason
                }
              ]
            })
          );
        }

        const { inTolerance } = evaluateCharacteristicMeasurement({
          nominalValue: feature.nominalValue,
          tolerancePlus: feature.tolerancePlus,
          toleranceMinus: feature.toleranceMinus,
          measuredValue: m.measuredValue
        });

        return {
          inspectionFeatureId: m.inspectionFeatureId,
          measuredValue: m.measuredValue,
          measuredValueNumeric: parseNumericMeasurement(m.measuredValue),
          inTolerance,
          gaugeId: m.gaugeId ?? null,
          gaugeOverride,
          gaugeOverrideReason: m.gaugeOverrideReason ?? null
        };
      });

      const sampleStatus = computeSampleAutoStatus(evaluations) ?? "Passed";

      const existingSamples = await trx
        .selectFrom("inspectionSample")
        .select(["id"])
        .where("inspectionId", "=", inspectionId)
        .where("companyId", "=", companyId)
        .execute();

      const sample = await trx
        .insertInto("inspectionSample")
        .values({
          companyId,
          inspectionId,
          sampleIndex: existingSamples.length + 1,
          status: sampleStatus,
          notes: args.notes ?? null,
          inspectedBy: userId,
          inspectedAt: nowIso,
          createdBy: userId
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("inspectionSampleMeasurement" as any)
        .values(
          evaluations.map((evaluation) => ({
            companyId,
            inspectionSampleId: sample.id,
            inspectionFeatureId: evaluation.inspectionFeatureId,
            measuredValue: evaluation.measuredValue,
            measuredValueNumeric: evaluation.measuredValueNumeric,
            inTolerance: evaluation.inTolerance,
            gaugeId: evaluation.gaugeId,
            gaugeOverride: evaluation.gaugeOverride,
            gaugeOverrideReason: evaluation.gaugeOverrideReason,
            createdBy: userId
          }))
        )
        .execute();

      const samplesPerRun = Number((inspection as any).samplesPerRun ?? 1);
      const totalSamples = existingSamples.length + 1;
      const inspectionStatus =
        sampleStatus === "Failed"
          ? "Failed"
          : totalSamples >= samplesPerRun
            ? "Passed"
            : "In Progress";

      const inspectionUpdate: Record<string, unknown> = {
        status: inspectionStatus,
        updatedBy: userId,
        updatedAt: nowIso
      };
      if (inspectionStatus === "Passed" || inspectionStatus === "Failed") {
        inspectionUpdate.dispositionedBy = userId;
        inspectionUpdate.dispositionedAt = nowIso;
      }

      const updatedInspection = await trx
        .updateTable("inspection")
        .set(inspectionUpdate as any)
        .where("id", "=", inspectionId)
        .where("companyId", "=", companyId)
        .returning(["id", "status"])
        .executeTakeFirstOrThrow();

      // Roll the outcome up to any Lot inspection dependency rows that gate
      // Accept on this run.
      if (inspectionStatus === "Passed" || inspectionStatus === "Failed") {
        await trx
          .updateTable("inspectionDependency" as any)
          .set({
            status: inspectionStatus === "Passed" ? "Satisfied" : "Failed",
            updatedBy: userId,
            updatedAt: nowIso
          } as any)
          .where("prerequisiteInspectionId" as any, "=", inspectionId)
          .where("companyId" as any, "=", companyId)
          .execute();
      }

      return {
        sampleId: sample.id,
        status: sampleStatus,
        inspectionStatus: updatedInspection.status
      };
    });

    return { data: result, error: null };
  } catch (err) {
    if (err instanceof Error) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.blockers) {
          return errResult(parsed.message, parsed.blockers);
        }
      } catch {
        // Not a structured blocker error — fall through to the plain message.
      }
    }
    return errResult(
      err instanceof Error
        ? err.message
        : "Failed to record in-process inspection sample"
    );
  }
}

// -------------------------------------------------------------
// 6. waiveInspectionDependency
// -------------------------------------------------------------
// Marks a required inspectionDependency as Waived with a reason, so the Lot
// Accept gate no longer blocks on it. Requires quality_update permission at
// the route level (this is a plain data mutation, no extra business rule).

export async function waiveInspectionDependency(args: {
  dependencyId: string;
  reason: string;
  companyId: string;
  userId: string;
}): Promise<Result<{ id: string }>> {
  const { dependencyId, reason, companyId, userId } = args;
  if (!reason?.trim()) {
    return errResult("A reason is required to waive a dependency");
  }

  const db = getDatabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const updated = await db
      .updateTable("inspectionDependency" as any)
      .set({
        status: "Waived",
        waivedBy: userId,
        waivedAt: nowIso,
        waiveReason: reason,
        updatedBy: userId,
        updatedAt: nowIso
      } as any)
      .where("id" as any, "=", dependencyId)
      .where("companyId" as any, "=", companyId)
      .returning(["id"] as any)
      .executeTakeFirst();

    if (!updated) {
      return errResult("Dependency not found");
    }

    return { data: { id: (updated as any).id }, error: null };
  } catch (err) {
    return errResult(
      err instanceof Error ? err.message : "Failed to waive dependency"
    );
  }
}
