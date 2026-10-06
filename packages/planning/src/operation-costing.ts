import {
  costingQuantityMultiplier,
  normalizeTimeToHours,
  type OperationTimeBasis
} from "./operation-time.ts";

export type InsideOperationRates = {
  setupRate?: number | null;
  laborRate?: number | null;
  machineRate?: number | null;
  overheadRate?: number | null;
};

export type InsideOperationTimes = {
  setupTime?: number | null;
  setupUnit?: string | null;
  machineTime?: number | null;
  machineUnit?: string | null;
  operatorAttention?: unknown;
  partsPerCycle?: unknown;
  timeBasis?: unknown;
};

export function normalizeOperatorAttention(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function computeInsideOperationCostEffects(args: {
  op: InsideOperationTimes & InsideOperationRates;
  nodeQuantity: number;
}): {
  setupCost: (quoteQty: number) => number;
  laborCost: (quoteQty: number) => number;
  machineCost: (quoteQty: number) => number;
  overheadCost: (quoteQty: number) => number;
} {
  const multFn = (quoteQty: number) =>
    costingQuantityMultiplier({
      quotePartQuantity: quoteQty,
      nodeQuantity: args.nodeQuantity,
      partsPerCycle: args.op.partsPerCycle,
      timeBasis: args.op.timeBasis as OperationTimeBasis | undefined
    });

  return {
    setupCost: (quoteQty) => {
      const mult = multFn(quoteQty);
      if (!args.op.setupTime) return 0;
      const { fixedHours, hoursPerUnit } = normalizeTimeToHours(
        args.op.setupTime,
        args.op.setupUnit
      );
      const setupHours = fixedHours + hoursPerUnit * mult;
      return setupHours * (args.op.setupRate ?? 0);
    },
    laborCost: (quoteQty) => {
      const mult = multFn(quoteQty);
      if (!args.op.machineTime) return 0;
      const { fixedHours, hoursPerUnit } = normalizeTimeToHours(
        args.op.machineTime,
        args.op.machineUnit
      );
      const runHours = fixedHours + hoursPerUnit * mult;
      return (
        runHours *
        normalizeOperatorAttention(args.op.operatorAttention) *
        (args.op.laborRate ?? 0)
      );
    },
    machineCost: (quoteQty) => {
      const mult = multFn(quoteQty);
      if (!args.op.machineTime) return 0;
      const { fixedHours, hoursPerUnit } = normalizeTimeToHours(
        args.op.machineTime,
        args.op.machineUnit
      );
      const runHours = fixedHours + hoursPerUnit * mult;
      return runHours * (args.op.machineRate ?? 0);
    },
    overheadCost: (quoteQty) => {
      const mult = multFn(quoteQty);
      if (!args.op.machineTime) return 0;
      const { fixedHours, hoursPerUnit } = normalizeTimeToHours(
        args.op.machineTime,
        args.op.machineUnit
      );
      const runHours = fixedHours + hoursPerUnit * mult;
      return runHours * (args.op.overheadRate ?? 0);
    }
  };
}
