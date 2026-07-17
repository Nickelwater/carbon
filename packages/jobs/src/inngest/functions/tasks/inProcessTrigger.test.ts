import { describe, expect, it } from "vitest";
import {
  computeInProcessTriggerOrdinals,
  maxDueOrdinal,
  triggerThresholdForOrdinal,
  unionIntervalSeconds
} from "./inProcessTrigger";

describe("triggerThresholdForOrdinal", () => {
  it("computes thresholds from firstTriggerAt and interval", () => {
    expect(triggerThresholdForOrdinal(1, 10, 50)).toBe(10);
    expect(triggerThresholdForOrdinal(2, 10, 50)).toBe(60);
    expect(triggerThresholdForOrdinal(3, 10, 50)).toBe(110);
  });
});

describe("maxDueOrdinal", () => {
  it("returns 0 below the first threshold", () => {
    expect(maxDueOrdinal(9, 10, 50)).toBe(0);
  });

  it("returns 1 at exactly the first threshold", () => {
    expect(maxDueOrdinal(10, 10, 50)).toBe(1);
  });

  it("returns all crossed ordinals when jumping past multiple thresholds", () => {
    expect(maxDueOrdinal(110, 10, 50)).toBe(3);
    expect(maxDueOrdinal(111, 10, 50)).toBe(3);
  });

  it("treats non-positive interval as a single trigger", () => {
    expect(maxDueOrdinal(100, 10, 0)).toBe(1);
  });
});

describe("unionIntervalSeconds", () => {
  it("returns 0 for an empty list", () => {
    expect(unionIntervalSeconds([])).toBe(0);
  });

  it("sums non-overlapping intervals", () => {
    expect(
      unionIntervalSeconds([
        { start: 0, end: 60 },
        { start: 120, end: 180 }
      ])
    ).toBe(120);
  });

  it("merges overlapping intervals without double-counting", () => {
    expect(
      unionIntervalSeconds([
        { start: 0, end: 100 },
        { start: 50, end: 150 }
      ])
    ).toBe(150);
  });

  it("merges concurrent Labor and Machine events", () => {
    expect(
      unionIntervalSeconds([
        { start: 0, end: 300 },
        { start: 0, end: 300 },
        { start: 200, end: 500 }
      ])
    ).toBe(500);
  });

  it("ignores invalid intervals where end <= start", () => {
    expect(
      unionIntervalSeconds([
        { start: 10, end: 10 },
        { start: 20, end: 15 },
        { start: 0, end: 30 }
      ])
    ).toBe(30);
  });
});

describe("computeInProcessTriggerOrdinals", () => {
  const base = {
    triggerType: "Quantity" as const,
    firstTriggerAt: 10,
    interval: 50,
    existingOrdinals: [] as const
  };

  it("creates the first ordinal when quantity reaches firstTriggerAt", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 10,
        existingOrdinals: []
      })
    ).toEqual({ toCreate: [1], toCancel: [] });
  });

  it("creates nothing below the first threshold", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 9,
        existingOrdinals: []
      })
    ).toEqual({ toCreate: [], toCancel: [] });
  });

  it("creates all missing ordinals when jumping past multiple thresholds", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 110,
        existingOrdinals: [{ ordinal: 1, status: "Passed" }]
      })
    ).toEqual({ toCreate: [2, 3], toCancel: [] });
  });

  it("is idempotent when ordinals already exist", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 110,
        existingOrdinals: [
          { ordinal: 1, status: "Passed" },
          { ordinal: 2, status: "Pending" },
          { ordinal: 3, status: "Pending" }
        ]
      })
    ).toEqual({ toCreate: [], toCancel: [] });
  });

  it("never re-creates completed ordinals", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 60,
        existingOrdinals: [{ ordinal: 2, status: "Failed" }]
      })
    ).toEqual({ toCreate: [1], toCancel: [] });
  });

  it("lists pending ordinals beyond the corrected threshold for cancellation", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 55,
        existingOrdinals: [
          { ordinal: 1, status: "Passed" },
          { ordinal: 2, status: "Pending" },
          { ordinal: 3, status: "InProgress" }
        ]
      })
    ).toEqual({ toCreate: [], toCancel: [2, 3] });
  });

  it("does not cancel completed ordinals after quantity correction", () => {
    expect(
      computeInProcessTriggerOrdinals({
        ...base,
        cumulativeProductionQuantity: 55,
        existingOrdinals: [
          { ordinal: 1, status: "Passed" },
          { ordinal: 2, status: "Passed" },
          { ordinal: 3, status: "Failed" }
        ]
      })
    ).toEqual({ toCreate: [], toCancel: [] });
  });

  it("uses accumulated active seconds for ElapsedTime triggers", () => {
    expect(
      computeInProcessTriggerOrdinals({
        triggerType: "ElapsedTime",
        firstTriggerAt: 300,
        interval: 600,
        accumulatedActiveSeconds: 1500,
        existingOrdinals: [{ ordinal: 1, status: "Passed" }]
      })
    ).toEqual({ toCreate: [2, 3], toCancel: [] });
  });

  it("derives elapsed time from unioned productionEvent intervals", () => {
    const accumulatedActiveSeconds = unionIntervalSeconds([
      { start: 0, end: 400 },
      { start: 350, end: 900 }
    ]);

    expect(accumulatedActiveSeconds).toBe(900);
    expect(
      computeInProcessTriggerOrdinals({
        triggerType: "ElapsedTime",
        firstTriggerAt: 300,
        interval: 600,
        accumulatedActiveSeconds,
        existingOrdinals: []
      })
    ).toEqual({ toCreate: [1, 2], toCancel: [] });
  });
});
