// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  convertTimeToMilliseconds,
  normalizeTimeToHours,
  resolveDurationQuantity
} from "../operation-time.ts";
import { HOUR_MS } from "./date-utils.ts";
import type { BaseOperation } from "./types.ts";

const HOURS_PER_WORKDAY = 8;

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
 * Total = setup + max(labor, machine) since labor and machine can overlap
 */
export function calculateDurationHours(operation: BaseOperation): number {
  const setupHours = convertToHours(
    operation.setupTime,
    operation.setupUnit,
    operation
  );
  const laborHours = convertToHours(
    operation.laborTime,
    operation.laborUnit,
    operation
  );
  const machineHours = convertToHours(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  return setupHours + Math.max(laborHours, machineHours);
}

/**
 * Hours a person is hands-on at the START of the operation: setup + labor.
 * The machine runs the remaining max(0, machine - labor) unattended. When
 * labor >= machine this equals calculateDurationHours (fully attended).
 */
export function calculateAttendedHours(operation: BaseOperation): number {
  const setupHours = convertToHours(
    operation.setupTime,
    operation.setupUnit,
    operation
  );
  const laborHours = convertToHours(
    operation.laborTime,
    operation.laborUnit,
    operation
  );

  return setupHours + laborHours;
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
  const laborMs = convertToMilliseconds(
    operation.laborTime,
    operation.laborUnit,
    operation
  );
  const machineMs = convertToMilliseconds(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  return setupMs + Math.max(laborMs, machineMs);
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
  const laborHours = convertToHours(
    operation.laborTime,
    operation.laborUnit,
    operation
  );
  const machineHours = convertToHours(
    operation.machineTime,
    operation.machineUnit,
    operation
  );

  const totalHours = setupHours + Math.max(laborHours, machineHours);
  const totalDays = Math.max(Math.ceil(totalHours / HOURS_PER_WORKDAY), 1);
  const totalMs = totalHours * HOUR_MS;

  return {
    setupHours,
    laborHours,
    machineHours,
    totalHours,
    totalDays,
    totalMs
  };
}

/**
 * Remaining-work fractions for a (possibly started) operation, so the schedule
 * reserves only the work left to do — not the full standard content — anchored
 * at now.
 *
 * - `work` scales labor and machine time by the quantity still to run:
 *   clamp(1 − quantityComplete / max(operationQuantity, 1), 0, 1).
 * - `setup` is 1 until any production event exists on the operation, then 0
 *   (setup is a one-time cost — once the machine is set up it stays set up).
 *
 * Quantity-proportional only (per spec): remaining time is derived from
 * quantity, never from productionEvent durations.
 */
export function remainingFractions(
  op: {
    operationQuantity?: number | null;
    quantityComplete?: number | null;
  },
  hasProductionEvent: boolean
): { setup: number; work: number } {
  const complete = op.quantityComplete ?? 0;
  const total = Math.max(op.operationQuantity ?? 1, 1);
  const work = Math.min(Math.max(1 - complete / total, 0), 1);
  const setup = hasProductionEvent ? 0 : 1;
  return { setup, work };
}

export { convertToHours, convertToMilliseconds, HOURS_PER_WORKDAY };
