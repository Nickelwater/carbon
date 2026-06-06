import {
  costingQuantityMultiplier,
  normalizeTimeToHours,
  type OperationTimeBasis
} from "./operation-time";

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

/** Setup + run hours for an inside operation at a given quantity multiplier */
export function computeInsideOperationHours(
  op: InsideOperationTimes,
  quantityMultiplier: number
): {
  setupHours: number;
  runHours: number;
  effectiveLaborHours: number;
} {
  const mult = Number(quantityMultiplier) || 0;
  const attention = normalizeOperatorAttention(op.operatorAttention);

  let setupHours = 0;
  if (op.setupTime) {
    const normalized = normalizeTimeToHours(op.setupTime, op.setupUnit);
    setupHours = normalized.fixedHours + normalized.hoursPerUnit * mult;
  }

  let runHours = 0;
  if (op.machineTime) {
    const normalized = normalizeTimeToHours(op.machineTime, op.machineUnit);
    runHours = normalized.fixedHours + normalized.hoursPerUnit * mult;
  }

  return {
    setupHours,
    runHours,
    effectiveLaborHours: runHours * attention
  };
}

export function computeInsideOperationCost(args: {
  op: InsideOperationTimes;
  rates: InsideOperationRates;
  quantityMultiplier: number;
}): {
  setupHours: number;
  runHours: number;
  effectiveLaborHours: number;
  setupCost: number;
  machineCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
} {
  const hours = computeInsideOperationHours(args.op, args.quantityMultiplier);
  const setupRate = args.rates.setupRate ?? 0;
  const laborRate = args.rates.laborRate ?? 0;
  const machineRate = args.rates.machineRate ?? 0;
  const overheadRate = args.rates.overheadRate ?? 0;

  const setupCost = hours.setupHours * setupRate;
  const machineCost = hours.runHours * machineRate;
  const laborCost = hours.effectiveLaborHours * laborRate;
  const overheadCost = hours.runHours * overheadRate;

  return {
    ...hours,
    setupCost,
    machineCost,
    laborCost,
    overheadCost,
    totalCost: setupCost + machineCost + laborCost + overheadCost
  };
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
