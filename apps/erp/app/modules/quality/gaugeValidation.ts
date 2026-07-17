/**
 * Pure gauge-requirement checks for In-Process measurement recording.
 * Extracted so recordInProcessInspectionSample (quality.server.ts) can be
 * unit tested without a database.
 */

import { parseNumericMeasurement } from "./evaluateCharacteristicMeasurement";

export type GaugeCalibrationStatus =
  | "Pending"
  | "In-Calibration"
  | "Out-of-Calibration";

export type GaugeSnapshot = {
  gaugeStatus: "Active" | "Inactive";
  calibrationStatus: GaugeCalibrationStatus;
};

export type GaugeValidationInput = {
  /** A feature is "numeric" (requires a calibrated gauge) when it has a parseable nominal value. */
  nominalValue: string | null | undefined;
  gaugeId: string | null | undefined;
  gaugeOverride: boolean;
  gaugeOverrideReason: string | null | undefined;
  /** null when gaugeId is set but the gauge can't be found. */
  gauge: GaugeSnapshot | null;
};

export type GaugeValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function isNumericFeature(
  nominalValue: string | null | undefined
): boolean {
  return parseNumericMeasurement(nominalValue) != null;
}

/**
 * Mirrors the `gauges` view's `gaugeCalibrationStatusWithDueDate` derived
 * column: an overdue nextCalibrationDate always overrides the stored status.
 */
export function resolveGaugeCalibrationStatus(args: {
  gaugeCalibrationStatus: GaugeCalibrationStatus;
  nextCalibrationDate: string | null | undefined;
  now?: Date;
}): GaugeCalibrationStatus {
  const now = args.now ?? new Date();
  if (args.nextCalibrationDate) {
    const due = new Date(args.nextCalibrationDate);
    if (due.getTime() < now.getTime()) {
      return "Out-of-Calibration";
    }
  }
  return args.gaugeCalibrationStatus;
}

export function validateGaugeForMeasurement(
  input: GaugeValidationInput
): GaugeValidationResult {
  if (!isNumericFeature(input.nominalValue)) {
    return { ok: true };
  }

  if (!input.gaugeId) {
    if (input.gaugeOverride && (input.gaugeOverrideReason ?? "").trim()) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "Numeric feature requires a gauge, or gaugeOverride with a reason"
    };
  }

  if (!input.gauge) {
    return { ok: false, reason: "Gauge not found" };
  }

  if (input.gauge.gaugeStatus !== "Active") {
    return { ok: false, reason: "Gauge is inactive" };
  }

  if (input.gauge.calibrationStatus === "Out-of-Calibration") {
    return { ok: false, reason: "Gauge is out of calibration" };
  }

  return { ok: true };
}
