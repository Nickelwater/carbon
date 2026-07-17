import { describe, expect, it } from "vitest";
import {
  computeInProcessTriggerOrdinals,
  mapInspectionStatusToOrdinalStatus,
  toExistingOrdinals
} from "./inProcessTrigger";

describe("mapInspectionStatusToOrdinalStatus", () => {
  it("maps DB 'In Progress' (space) to the lib's 'InProgress'", () => {
    expect(mapInspectionStatusToOrdinalStatus("In Progress")).toBe(
      "InProgress"
    );
  });

  it("passes through Pending/Passed/Failed/Cancelled unchanged", () => {
    expect(mapInspectionStatusToOrdinalStatus("Pending")).toBe("Pending");
    expect(mapInspectionStatusToOrdinalStatus("Passed")).toBe("Passed");
    expect(mapInspectionStatusToOrdinalStatus("Failed")).toBe("Failed");
    expect(mapInspectionStatusToOrdinalStatus("Cancelled")).toBe("Cancelled");
  });

  it("defaults unknown/null statuses to Pending", () => {
    expect(mapInspectionStatusToOrdinalStatus(null)).toBe("Pending");
    expect(mapInspectionStatusToOrdinalStatus(undefined)).toBe("Pending");
    expect(mapInspectionStatusToOrdinalStatus("Something else")).toBe(
      "Pending"
    );
  });
});

describe("toExistingOrdinals", () => {
  it("drops rows without a triggerOrdinal", () => {
    expect(
      toExistingOrdinals([
        { triggerOrdinal: null, status: "Pending" },
        { triggerOrdinal: 1, status: "Passed" }
      ])
    ).toEqual([{ ordinal: 1, status: "Passed" }]);
  });
});

/**
 * Simulates the evaluator's create/cancel loop across repeated calls against
 * DB-shaped rows (no real DB) to prove idempotency: re-evaluating with the
 * same underlying metric never re-creates or re-cancels the same ordinal.
 */
describe("evaluator idempotency (pure, no DB)", () => {
  const plan = {
    triggerType: "Quantity" as const,
    firstTriggerAt: 10,
    interval: 10
  };

  it("create pass is idempotent once rows exist as Pending", () => {
    // First evaluation: nothing exists yet, quantity is 25 -> ordinals 1 and 2 due.
    const firstPass = computeInProcessTriggerOrdinals({
      ...plan,
      cumulativeProductionQuantity: 25,
      existingOrdinals: []
    });
    expect(firstPass).toEqual({ toCreate: [1, 2], toCancel: [] });

    // Simulate the rows now existing in the DB as freshly-created Pending runs.
    const dbRowsAfterCreate = firstPass.toCreate.map((ordinal) => ({
      triggerOrdinal: ordinal,
      status: "Pending"
    }));
    const existingOrdinals = toExistingOrdinals(dbRowsAfterCreate);

    // Re-evaluating with the same quantity must not re-create anything.
    const secondPass = computeInProcessTriggerOrdinals({
      ...plan,
      cumulativeProductionQuantity: 25,
      existingOrdinals
    });
    expect(secondPass).toEqual({ toCreate: [], toCancel: [] });
  });

  it("cancel pass is idempotent once rows are marked Cancelled", () => {
    // Quantity corrected downward after ordinal 2 was created as Pending.
    const dbRows = [
      { triggerOrdinal: 1, status: "Passed" },
      { triggerOrdinal: 2, status: "Pending" }
    ];
    const firstPass = computeInProcessTriggerOrdinals({
      ...plan,
      cumulativeProductionQuantity: 15,
      existingOrdinals: toExistingOrdinals(dbRows)
    });
    expect(firstPass).toEqual({ toCreate: [], toCancel: [2] });

    // Simulate cancellation landing in the DB.
    const dbRowsAfterCancel = [
      { triggerOrdinal: 1, status: "Passed" },
      { triggerOrdinal: 2, status: "Cancelled" }
    ];

    const secondPass = computeInProcessTriggerOrdinals({
      ...plan,
      cumulativeProductionQuantity: 15,
      existingOrdinals: toExistingOrdinals(dbRowsAfterCancel)
    });
    expect(secondPass).toEqual({ toCreate: [], toCancel: [] });
  });
});
