import { describe, expect, it } from "vitest";
import {
  computeSampleAutoStatus,
  evaluateCharacteristicMeasurement
} from "./evaluateCharacteristicMeasurement";

describe("evaluateCharacteristicMeasurement", () => {
  it("returns in tolerance when measured value is within symmetric tolerances", () => {
    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.1",
        toleranceMinus: "0.1",
        measuredValue: "10.05"
      })
    ).toEqual({ inTolerance: true });
  });

  it("returns out of tolerance when measured value exceeds upper bound", () => {
    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.1",
        toleranceMinus: "0.1",
        measuredValue: "10.2"
      })
    ).toEqual({ inTolerance: false });
  });

  it("supports asymmetric tolerances", () => {
    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.05",
        toleranceMinus: "0.15",
        measuredValue: "9.86"
      })
    ).toEqual({ inTolerance: true });

    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.05",
        toleranceMinus: "0.15",
        measuredValue: "9.84"
      })
    ).toEqual({ inTolerance: false });
  });

  it("strips non-numeric characters from measured values", () => {
    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.1",
        toleranceMinus: "0.1",
        measuredValue: "10.05 mm"
      })
    ).toEqual({ inTolerance: true });
  });

  it("returns null when nominal or measured cannot be parsed", () => {
    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: null,
        tolerancePlus: "0.1",
        toleranceMinus: "0.1",
        measuredValue: "10"
      })
    ).toEqual({ inTolerance: null });

    expect(
      evaluateCharacteristicMeasurement({
        nominalValue: "10",
        tolerancePlus: "0.1",
        toleranceMinus: "0.1",
        measuredValue: "n/a"
      })
    ).toEqual({ inTolerance: null });
  });
});

describe("computeSampleAutoStatus", () => {
  it("fails when any evaluable characteristic is out of tolerance", () => {
    expect(
      computeSampleAutoStatus([
        { inTolerance: true },
        { inTolerance: false },
        { inTolerance: null }
      ])
    ).toBe("Failed");
  });

  it("passes when all evaluable characteristics are in tolerance", () => {
    expect(
      computeSampleAutoStatus([
        { inTolerance: true },
        { inTolerance: true },
        { inTolerance: null }
      ])
    ).toBe("Passed");
  });

  it("returns null when no characteristics can be auto-evaluated", () => {
    expect(computeSampleAutoStatus([{ inTolerance: null }])).toBeNull();
  });
});
