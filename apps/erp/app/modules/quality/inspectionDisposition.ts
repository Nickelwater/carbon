/**
 * Pure disposition/sampling helpers extracted from quality.server.ts so the
 * Accept/Reject/Partial and reject-ledger-location logic can be unit tested
 * without a database. See dispositionInboundInspection / upsertInboundInspectionSample.
 */

export type DispositionDecision = "Accept" | "Reject" | "Partial";

export type DispositionFlipResult = {
  lotStatus: "Passed" | "Failed" | "Partial";
  idsToFlip: string[];
  flipStatus: "Available" | "Rejected" | null;
};

/**
 * Reject = entire lot non-conforming (ISO 9001:2015 §8.7). Accept only
 * releases un-sampled entities (sampled outcomes already flipped
 * per-sample). Partial leaves un-sampled entities On Hold.
 * Batch lots keep the entity On Hold until disposition — Accept releases
 * the full batch quantity once sampling requirements are met.
 */
export function resolveDispositionFlip(args: {
  decision: DispositionDecision;
  batchLot: boolean;
  allLotIds: string[];
  unsampledIds: string[];
}): DispositionFlipResult {
  const { decision, batchLot, allLotIds, unsampledIds } = args;
  switch (decision) {
    case "Accept":
      return {
        lotStatus: "Passed",
        idsToFlip: batchLot ? allLotIds : unsampledIds,
        flipStatus: "Available"
      };
    case "Reject":
      return {
        lotStatus: "Failed",
        idsToFlip: allLotIds,
        flipStatus: "Rejected"
      };
    case "Partial":
      return { lotStatus: "Partial", idsToFlip: [], flipStatus: null };
  }
}

/**
 * Non-tracked (Inventory) items have no tracked entities to flip, so a
 * rejected lot needs a compensating Negative Adjmt. ledger entry against the
 * location the item actually lives in. Prefer the inspection's own snapshot
 * (`inspection.locationId`, captured at receipt/lot-creation time) since it
 * survives even if the receipt line is later edited; fall back to the
 * receipt line's location for legacy rows created before the snapshot
 * existed.
 */
export function resolveRejectLedgerLocation(args: {
  inspectionLocationId: string | null | undefined;
  receiptLineLocationId: string | null | undefined;
}): string | null {
  return args.inspectionLocationId ?? args.receiptLineLocationId ?? null;
}

/**
 * Batch lots record multiple samples against the same tracked entity
 * (sampleIndex 1, 2, 3, ...); the next index is just one past however many
 * samples already exist for that entity on this inspection.
 */
export function nextSampleIndex(args: {
  existingCountForEntity: number;
}): number {
  return args.existingCountForEntity + 1;
}
