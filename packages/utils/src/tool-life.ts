import { cyclesFromParts } from "./parts-per-cycle";

export type ToolLifeBasis = "Cycles" | "RunTime";

export type ToolLifeLedgerSourceType =
  | "Manual"
  | "Reset"
  | "AutoIssue"
  | "ProductionCycles"
  | "ProductionRunTime"
  | "ScrapCycles"
  | "ScrapRunTime";

export function computeCycleConsumption(
  quantityParts: number,
  partsPerCycle: number | null | undefined
): number {
  return cyclesFromParts(quantityParts, partsPerCycle ?? 1);
}

export function computeRunTimeConsumption(
  quantityParts: number,
  partsPerCycle: number | null | undefined,
  machineTime: number | null | undefined
): number {
  const cycles = computeCycleConsumption(quantityParts, partsPerCycle);
  return cycles * (machineTime ?? 0);
}

export function isToolLifeLow(
  remaining: number | null | undefined,
  limit: number | null | undefined,
  threshold = 0.1
): boolean {
  if (remaining == null || limit == null || limit <= 0) return false;
  return remaining <= 0 || remaining / limit <= threshold;
}
