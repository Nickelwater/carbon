import type { BaseOperation } from "./types.ts";
import {
  convertTimeToMilliseconds,
  normalizeTimeToHours,
  resolveDurationQuantity
} from "../operation-time.ts";

const HOURS_PER_WORKDAY = 8;
const MS_PER_HOUR = 3_600_000;

function durationQuantityFor(operation: BaseOperation): number {
  return resolveDurationQuantity({
    partQuantity: operation.operationQuantity ?? 1,
    partsPerCycle: operation.partsPerCycle,
    timeBasis: operation.timeBasis
  });
}

function convertToHours(
  time: number | null | undefined,
  unit: string | null | undefined,
  operation: BaseOperation
): number {
  if (!time || !unit) return 0;
  const { fixedHours, hoursPerUnit } = normalizeTimeToHours(time, unit);
  const quantity = durationQuantityFor(operation);
  return fixedHours + hoursPerUnit * quantity;
}

function convertToMilliseconds(
  time: number | null | undefined,
  unit: string | null | undefined,
  operation: BaseOperation
): number {
  if (!time || !unit) return 0;
  return convertTimeToMilliseconds(time, unit, durationQuantityFor(operation));
}

/**
 * Calculate the total duration of an operation in hours
 * Total = setup + run (machine time)
 */
export function calculateDurationHours(operation: BaseOperation): number {
  const setupHours = convertToHours(
    operation.setupTime,
    operation.setupUnit,
    operation
  );
  const runHours = convertToHours(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  return setupHours + runHours;
}

/**
 * Calculate the total duration of an operation in working days
 * Rounds up to at least 1 day
 */
export function calculateDurationDays(
  operation: BaseOperation,
  hoursPerDay: number = HOURS_PER_WORKDAY
): number {
  const hours = calculateDurationHours(operation);
  return Math.max(Math.ceil(hours / hoursPerDay), 1);
}

/**
 * Calculate the total duration of an operation in milliseconds
 * Used for load balancing calculations
 */
export function calculateDurationMs(operation: BaseOperation): number {
  const setupMs = convertToMilliseconds(
    operation.setupTime,
    operation.setupUnit,
    operation
  );
  const runMs = convertToMilliseconds(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  return setupMs + runMs;
}

/**
 * Calculate detailed duration breakdown for an operation
 */
export function calculateDurationBreakdown(operation: BaseOperation): {
  setupHours: number;
  laborHours: number;
  machineHours: number;
  totalHours: number;
  totalDays: number;
  totalMs: number;
} {
  const setupHours = convertToHours(
    operation.setupTime,
    operation.setupUnit,
    operation
  );
  const runHours = convertToHours(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  const totalHours = setupHours + runHours;
  const totalDays = Math.max(Math.ceil(totalHours / HOURS_PER_WORKDAY), 1);
  const totalMs = totalHours * MS_PER_HOUR;

  return {
    setupHours,
    laborHours: 0,
    machineHours: runHours,
    totalHours,
    totalDays,
    totalMs
  };
}

export { convertToHours, convertToMilliseconds, HOURS_PER_WORKDAY };
