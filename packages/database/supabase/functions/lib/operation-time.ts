/**
 * Operation timing helpers for Supabase edge functions.
 * Inlined here (not re-exported from @carbon/utils) because Deno cannot
 * reliably resolve imports outside the functions directory at runtime.
 */

export function normalizePartsPerCycle(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function targetCycles(
  partsQuantity: number,
  partsPerCycle: unknown
): number {
  const ppc = normalizePartsPerCycle(partsPerCycle);
  if (ppc <= 1) {
    return partsQuantity;
  }
  return Math.ceil(partsQuantity / ppc);
}

export function normalizeTimeBasis(value: unknown): "Piece" | "Cycle" {
  return value === "Cycle" ? "Cycle" : "Piece";
}

export function isCycleTimeBasis(value: unknown): boolean {
  return normalizeTimeBasis(value) === "Cycle";
}

/** Quantity multiplier for variable (non-fixed) factor units */
export function resolveDurationQuantity(args: {
  partQuantity: number;
  partsPerCycle?: unknown;
  timeBasis?: unknown;
}): number {
  const partQuantity = Number(args.partQuantity) || 0;
  if (isCycleTimeBasis(args.timeBasis)) {
    return targetCycles(partQuantity, args.partsPerCycle);
  }
  return partQuantity;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;

export function convertTimeToMilliseconds(
  time: number | null | undefined,
  unit: string | null | undefined,
  quantity: number
): number {
  if (!time || !unit) return 0;
  const q = Number(quantity) || 0;

  switch (unit) {
    case "Total Hours":
      return time * MS_PER_HOUR;
    case "Total Minutes":
      return time * MS_PER_MINUTE;
    case "Hours/Piece":
    case "Hours/Cycle":
      return time * q * MS_PER_HOUR;
    case "Hours/100 Pieces":
    case "Hours/100 Cycles":
      return (time / 100) * q * MS_PER_HOUR;
    case "Hours/1000 Pieces":
    case "Hours/1000 Cycles":
      return (time / 1000) * q * MS_PER_HOUR;
    case "Minutes/Piece":
    case "Minutes/Cycle":
      return time * q * MS_PER_MINUTE;
    case "Minutes/100 Pieces":
    case "Minutes/100 Cycles":
      return (time / 100) * q * MS_PER_MINUTE;
    case "Minutes/1000 Pieces":
    case "Minutes/1000 Cycles":
      return (time / 1000) * q * MS_PER_MINUTE;
    case "Pieces/Hour":
    case "Cycles/Hour":
      return time > 0 ? (q / time) * MS_PER_HOUR : 0;
    case "Pieces/Minute":
    case "Cycles/Minute":
      return time > 0 ? (q / time) * MS_PER_MINUTE : 0;
    case "Seconds/Piece":
    case "Seconds/Cycle":
      return time * q * MS_PER_SECOND;
    default:
      return 0;
  }
}

export function normalizeTimeToHours(
  time: number,
  unit: string | null | undefined
): { fixedHours: number; hoursPerUnit: number } {
  let fixedHours = 0;
  let hoursPerUnit = 0;
  switch (unit) {
    case "Total Hours":
      fixedHours = time;
      break;
    case "Total Minutes":
      fixedHours = time / 60;
      break;
    case "Hours/Piece":
    case "Hours/Cycle":
      hoursPerUnit = time;
      break;
    case "Hours/100 Pieces":
    case "Hours/100 Cycles":
      hoursPerUnit = time / 100;
      break;
    case "Hours/1000 Pieces":
    case "Hours/1000 Cycles":
      hoursPerUnit = time / 1000;
      break;
    case "Minutes/Piece":
    case "Minutes/Cycle":
      hoursPerUnit = time / 60;
      break;
    case "Minutes/100 Pieces":
    case "Minutes/100 Cycles":
      hoursPerUnit = time / 100 / 60;
      break;
    case "Minutes/1000 Pieces":
    case "Minutes/1000 Cycles":
      hoursPerUnit = time / 1000 / 60;
      break;
    case "Pieces/Hour":
    case "Cycles/Hour":
      hoursPerUnit = time > 0 ? 1 / time : 0;
      break;
    case "Pieces/Minute":
    case "Cycles/Minute":
      hoursPerUnit = time > 0 ? 1 / (time * 60) : 0;
      break;
    case "Seconds/Piece":
    case "Seconds/Cycle":
      hoursPerUnit = time / 3600;
      break;
  }
  return { fixedHours, hoursPerUnit };
}

export function computeOperationDurations<
  T extends {
    setupTime?: number | null;
    setupUnit?: string | null;
    laborTime?: number | null;
    laborUnit?: string | null;
    machineTime?: number | null;
    machineUnit?: string | null;
    operationQuantity?: number | null;
    partsPerCycle?: unknown;
    timeBasis?: unknown;
  }
>(
  operation: T
): T & {
  duration: number;
  setupDuration: number;
  laborDuration: number;
  machineDuration: number;
} {
  const durationQuantity = resolveDurationQuantity({
    partQuantity: operation.operationQuantity ?? 0,
    partsPerCycle: operation.partsPerCycle,
    timeBasis: operation.timeBasis
  });

  const setupDuration = convertTimeToMilliseconds(
    operation.setupTime,
    operation.setupUnit,
    durationQuantity
  );
  const runDuration = convertTimeToMilliseconds(
    operation.machineTime,
    operation.machineUnit,
    durationQuantity
  );

  return {
    ...operation,
    duration: setupDuration + runDuration,
    setupDuration,
    laborDuration: 0,
    machineDuration: runDuration
  };
}

/** Scale factor for quote/BOM costing: multiply per-unit hours by this */
export function costingQuantityMultiplier(args: {
  quotePartQuantity: number;
  nodeQuantity: number;
  partsPerCycle?: unknown;
  timeBasis?: unknown;
}): number {
  const totalParts = (args.quotePartQuantity || 0) * (args.nodeQuantity || 1);
  if (isCycleTimeBasis(args.timeBasis)) {
    return targetCycles(totalParts, args.partsPerCycle);
  }
  return totalParts;
}
