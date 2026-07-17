/**
 * Pure In-Process trigger math, duplicated from
 * apps/erp/app/modules/quality/inProcessTrigger.ts. Kept API-aligned with the
 * ERP copy — jobs cannot import apps/erp, so this is a deliberate duplicate
 * rather than a shared package dependency. Any behavior change here should be
 * mirrored there (and vice versa).
 */

export const inProcessTriggerTypes = ["Quantity", "ElapsedTime"] as const;
export type InProcessTriggerType = (typeof inProcessTriggerTypes)[number];

export type ExistingInProcessOrdinal = {
  ordinal: number;
  status: "Pending" | "InProgress" | "Passed" | "Failed" | "Cancelled";
};

export type ComputeInProcessTriggerOrdinalsInput = {
  triggerType: InProcessTriggerType;
  /** Cumulative Production quantity only (excludes Scrap/Rework). Used when triggerType is Quantity. */
  cumulativeProductionQuantity?: number;
  /** Union of active productionEvent intervals in seconds. Used when triggerType is ElapsedTime. */
  accumulatedActiveSeconds?: number;
  firstTriggerAt: number;
  interval: number;
  existingOrdinals: ExistingInProcessOrdinal[];
};

export type ComputeInProcessTriggerOrdinalsResult = {
  /** Ordinals that are due but not yet created. */
  toCreate: number[];
  /** Pending/InProgress ordinals whose threshold is above the current metric (e.g. after quantity correction). */
  toCancel: number[];
};

const CANCELLABLE_STATUSES = new Set<ExistingInProcessOrdinal["status"]>([
  "Pending",
  "InProgress"
]);

/** Threshold value at which the given 1-based ordinal becomes due. */
export function triggerThresholdForOrdinal(
  ordinal: number,
  firstTriggerAt: number,
  interval: number
): number {
  if (ordinal < 1) {
    throw new RangeError("ordinal must be >= 1");
  }
  return firstTriggerAt + (ordinal - 1) * interval;
}

/** Merge overlapping intervals and return total covered seconds. */
export function unionIntervalSeconds(
  intervals: Array<{ start: number; end: number }>
): number {
  if (intervals.length === 0) {
    return 0;
  }

  const normalized = intervals
    .filter(({ start, end }) => end > start)
    .map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (normalized.length === 0) {
    return 0;
  }

  let total = 0;
  let currentStart = normalized[0]!.start;
  let currentEnd = normalized[0]!.end;

  for (let i = 1; i < normalized.length; i++) {
    const interval = normalized[i]!;
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }

  total += currentEnd - currentStart;
  return total;
}

function resolveCurrentMetric(
  input: ComputeInProcessTriggerOrdinalsInput
): number {
  if (input.triggerType === "Quantity") {
    return input.cumulativeProductionQuantity ?? 0;
  }
  return input.accumulatedActiveSeconds ?? 0;
}

/** Highest ordinal whose threshold is met by the current metric. */
export function maxDueOrdinal(
  currentMetric: number,
  firstTriggerAt: number,
  interval: number
): number {
  if (currentMetric < firstTriggerAt) {
    return 0;
  }
  if (interval <= 0) {
    return 1;
  }
  return Math.floor((currentMetric - firstTriggerAt) / interval) + 1;
}

/**
 * Maps the generic `inspection.status` enum (DB) to this lib's ordinal
 * status shape. DB uses "In Progress" (space); the lib uses "InProgress" to
 * stay a plain identifier.
 */
export function mapInspectionStatusToOrdinalStatus(
  status: string | null | undefined
): ExistingInProcessOrdinal["status"] {
  switch (status) {
    case "In Progress":
      return "InProgress";
    case "Passed":
      return "Passed";
    case "Failed":
      return "Failed";
    case "Cancelled":
      return "Cancelled";
    case "Pending":
    default:
      return "Pending";
  }
}

/** Converts raw `inspectionInProcess` + parent `inspection.status` rows into ExistingInProcessOrdinal. */
export function toExistingOrdinals(
  rows: Array<{ triggerOrdinal: number | null; status: string | null }>
): ExistingInProcessOrdinal[] {
  return rows
    .filter(
      (row): row is { triggerOrdinal: number; status: string | null } =>
        row.triggerOrdinal != null
    )
    .map((row) => ({
      ordinal: row.triggerOrdinal,
      status: mapInspectionStatusToOrdinalStatus(row.status)
    }));
}

export function computeInProcessTriggerOrdinals(
  input: ComputeInProcessTriggerOrdinalsInput
): ComputeInProcessTriggerOrdinalsResult {
  const { firstTriggerAt, interval, existingOrdinals } = input;
  const currentMetric = resolveCurrentMetric(input);
  const highestDue = maxDueOrdinal(currentMetric, firstTriggerAt, interval);

  const existingByOrdinal = new Map(
    existingOrdinals.map((entry) => [entry.ordinal, entry.status])
  );

  const toCreate: number[] = [];
  for (let ordinal = 1; ordinal <= highestDue; ordinal++) {
    if (!existingByOrdinal.has(ordinal)) {
      toCreate.push(ordinal);
    }
  }

  const toCancel: number[] = [];
  for (const existing of existingOrdinals) {
    if (!CANCELLABLE_STATUSES.has(existing.status)) {
      continue;
    }
    const threshold = triggerThresholdForOrdinal(
      existing.ordinal,
      firstTriggerAt,
      interval
    );
    if (currentMetric < threshold) {
      toCancel.push(existing.ordinal);
    }
  }

  toCreate.sort((a, b) => a - b);
  toCancel.sort((a, b) => a - b);

  return { toCreate, toCancel };
}
