import { describe, expect, it } from "vitest";
import {
  isNumericFeature,
  resolveGaugeCalibrationStatus,
  validateGaugeForMeasurement
} from "./gaugeValidation";

describe("resolveGaugeCalibrationStatus", () => {
  const now = new Date("2026-07-17T00:00:00Z");

  it("returns the stored status when there is no due date", () => {
    expect(
      resolveGaugeCalibrationStatus({
        gaugeCalibrationStatus: "In-Calibration",
        nextCalibrationDate: null,
        now
      })
    ).toBe("In-Calibration");
  });

  it("returns the stored status when the due date is in the future", () => {
    expect(
      resolveGaugeCalibrationStatus({
        gaugeCalibrationStatus: "In-Calibration",
        nextCalibrationDate: "2026-12-01",
        now
      })
    ).toBe("In-Calibration");
  });

  it("overrides to Out-of-Calibration once the due date has passed", () => {
    expect(
      resolveGaugeCalibrationStatus({
        gaugeCalibrationStatus: "In-Calibration",
        nextCalibrationDate: "2026-01-01",
        now
      })
    ).toBe("Out-of-Calibration");
  });
});

describe("isNumericFeature", () => {
  it("is numeric when nominalValue parses", () => {
    expect(isNumericFeature("1.250")).toBe(true);
  });

  it("is not numeric for null/blank/non-numeric nominal values", () => {
    expect(isNumericFeature(null)).toBe(false);
    expect(isNumericFeature("")).toBe(false);
    expect(isNumericFeature("Pass/Fail")).toBe(false);
  });
});

describe("validateGaugeForMeasurement", () => {
  it("allows non-numeric features without a gauge", () => {
    expect(
      validateGaugeForMeasurement({
        nominalValue: null,
        gaugeId: null,
        gaugeOverride: false,
        gaugeOverrideReason: null,
        gauge: null
      })
    ).toEqual({ ok: true });
  });

  it("rejects a numeric feature with no gauge and no override", () => {
    const result = validateGaugeForMeasurement({
      nominalValue: "1.25",
      gaugeId: null,
      gaugeOverride: false,
      gaugeOverrideReason: null,
      gauge: null
    });
    expect(result.ok).toBe(false);
  });

  it("allows a numeric feature with gaugeOverride + reason and no gauge", () => {
    expect(
      validateGaugeForMeasurement({
        nominalValue: "1.25",
        gaugeId: null,
        gaugeOverride: true,
        gaugeOverrideReason: "Gauge unavailable, verified with calipers",
        gauge: null
      })
    ).toEqual({ ok: true });
  });

  it("rejects override without a reason", () => {
    const result = validateGaugeForMeasurement({
      nominalValue: "1.25",
      gaugeId: null,
      gaugeOverride: true,
      gaugeOverrideReason: "  ",
      gauge: null
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive gauge", () => {
    const result = validateGaugeForMeasurement({
      nominalValue: "1.25",
      gaugeId: "gauge-1",
      gaugeOverride: false,
      gaugeOverrideReason: null,
      gauge: { gaugeStatus: "Inactive", calibrationStatus: "In-Calibration" }
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-calibration gauge", () => {
    const result = validateGaugeForMeasurement({
      nominalValue: "1.25",
      gaugeId: "gauge-1",
      gaugeOverride: false,
      gaugeOverrideReason: null,
      gauge: { gaugeStatus: "Active", calibrationStatus: "Out-of-Calibration" }
    });
    expect(result.ok).toBe(false);
  });

  it("allows an active, in-calibration gauge", () => {
    expect(
      validateGaugeForMeasurement({
        nominalValue: "1.25",
        gaugeId: "gauge-1",
        gaugeOverride: false,
        gaugeOverrideReason: null,
        gauge: { gaugeStatus: "Active", calibrationStatus: "In-Calibration" }
      })
    ).toEqual({ ok: true });
  });
});
