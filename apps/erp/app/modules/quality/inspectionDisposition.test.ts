import { describe, expect, it } from "vitest";
import {
  nextSampleIndex,
  resolveDispositionFlip,
  resolveRejectLedgerLocation
} from "./inspectionDisposition";

describe("resolveDispositionFlip", () => {
  it("Accept on a serial lot releases only un-sampled entities to Available", () => {
    expect(
      resolveDispositionFlip({
        decision: "Accept",
        batchLot: false,
        allLotIds: ["te_1", "te_2", "te_3"],
        unsampledIds: ["te_3"]
      })
    ).toEqual({
      lotStatus: "Passed",
      idsToFlip: ["te_3"],
      flipStatus: "Available"
    });
  });

  it("Accept on a batch lot releases the entire batch entity to Available", () => {
    expect(
      resolveDispositionFlip({
        decision: "Accept",
        batchLot: true,
        allLotIds: ["te_batch"],
        unsampledIds: []
      })
    ).toEqual({
      lotStatus: "Passed",
      idsToFlip: ["te_batch"],
      flipStatus: "Available"
    });
  });

  it("Reject flips every entity in the lot to Rejected, sampled or not", () => {
    expect(
      resolveDispositionFlip({
        decision: "Reject",
        batchLot: false,
        allLotIds: ["te_1", "te_2", "te_3"],
        unsampledIds: ["te_3"]
      })
    ).toEqual({
      lotStatus: "Failed",
      idsToFlip: ["te_1", "te_2", "te_3"],
      flipStatus: "Rejected"
    });
  });

  it("Reject on a batch lot also flips the batch entity to Rejected", () => {
    expect(
      resolveDispositionFlip({
        decision: "Reject",
        batchLot: true,
        allLotIds: ["te_batch"],
        unsampledIds: []
      })
    ).toEqual({
      lotStatus: "Failed",
      idsToFlip: ["te_batch"],
      flipStatus: "Rejected"
    });
  });

  it("Partial flips nothing, leaving un-sampled entities On Hold", () => {
    expect(
      resolveDispositionFlip({
        decision: "Partial",
        batchLot: false,
        allLotIds: ["te_1", "te_2"],
        unsampledIds: ["te_2"]
      })
    ).toEqual({
      lotStatus: "Partial",
      idsToFlip: [],
      flipStatus: null
    });
  });
});

describe("resolveRejectLedgerLocation", () => {
  it("prefers the inspection's snapshotted locationId", () => {
    expect(
      resolveRejectLedgerLocation({
        inspectionLocationId: "loc_snapshot",
        receiptLineLocationId: "loc_receipt_line"
      })
    ).toBe("loc_snapshot");
  });

  it("falls back to the receipt line's location when the snapshot is missing", () => {
    expect(
      resolveRejectLedgerLocation({
        inspectionLocationId: null,
        receiptLineLocationId: "loc_receipt_line"
      })
    ).toBe("loc_receipt_line");
  });

  it("returns null when neither location is known", () => {
    expect(
      resolveRejectLedgerLocation({
        inspectionLocationId: null,
        receiptLineLocationId: undefined
      })
    ).toBeNull();
  });
});

describe("nextSampleIndex", () => {
  it("starts at 1 for the first sample against an entity", () => {
    expect(nextSampleIndex({ existingCountForEntity: 0 })).toBe(1);
  });

  it("increments for subsequent samples against the same batch entity", () => {
    expect(nextSampleIndex({ existingCountForEntity: 2 })).toBe(3);
  });
});
