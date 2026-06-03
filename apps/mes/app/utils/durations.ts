import { computeOperationDurations } from "@carbon/utils";

export function makeDurations<
  T extends {
    setupTime?: number;
    setupUnit: string;
    laborTime?: number;
    laborUnit: string;
    machineTime?: number;
    machineUnit: string;
    operationQuantity: number | null;
    partsPerCycle?: unknown;
    timeBasis?: unknown;
  }
>(operation: T) {
  return computeOperationDurations(operation);
}
