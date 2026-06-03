export function normalizePartsPerCycle(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function usesCycleQuantity(
  partsPerCycle: unknown,
  timeBasis?: unknown
): boolean {
  if (timeBasis === "Cycle") {
    return true;
  }
  if (timeBasis === "Piece") {
    return false;
  }
  return normalizePartsPerCycle(partsPerCycle) > 1;
}

/** Target machine cycles for a part quantity. */
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

/** Completed cycles from recorded part quantity. */
export function cyclesFromParts(
  partsQuantity: number,
  partsPerCycle: unknown
): number {
  const ppc = normalizePartsPerCycle(partsPerCycle);
  if (ppc <= 1) {
    return partsQuantity;
  }
  return partsQuantity / ppc;
}

export function cyclesToParts(cycles: number, partsPerCycle: unknown): number {
  return cycles * normalizePartsPerCycle(partsPerCycle);
}

export function remainingCycles(args: {
  targetParts: number;
  partsComplete: number;
  partsReworked?: number;
  partsPerCycle: unknown;
}): number {
  const ppc = normalizePartsPerCycle(args.partsPerCycle);
  const target = targetCycles(args.targetParts, ppc);
  const complete = cyclesFromParts(
    args.partsComplete + (args.partsReworked ?? 0),
    ppc
  );
  return Math.max(0, target - complete);
}
