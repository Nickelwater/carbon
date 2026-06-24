function parseNumericMeasurement(
  value: string | null | undefined
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const cleaned = trimmed.replace(/[^\d.\-+eE]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "+" || cleaned === ".")
    return null;
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function evaluateCharacteristicMeasurement(args: {
  nominalValue: string | null | undefined;
  tolerancePlus: string | null | undefined;
  toleranceMinus: string | null | undefined;
  measuredValue: string | null | undefined;
}): { inTolerance: boolean | null } {
  const nominal = parseNumericMeasurement(args.nominalValue);
  const measured = parseNumericMeasurement(args.measuredValue);
  if (nominal == null || measured == null) {
    return { inTolerance: null };
  }

  const plus = parseNumericMeasurement(args.tolerancePlus) ?? 0;
  const minus = parseNumericMeasurement(args.toleranceMinus) ?? 0;
  const upper = nominal + plus;
  const lower = nominal - minus;

  return { inTolerance: measured >= lower && measured <= upper };
}

export function computeSampleAutoStatus(
  evaluations: Array<{ inTolerance: boolean | null }>
): "Passed" | "Failed" | null {
  const evaluable = evaluations.filter((e) => e.inTolerance !== null);
  if (evaluable.length === 0) return null;
  if (evaluable.some((e) => e.inTolerance === false)) return "Failed";
  return "Passed";
}
