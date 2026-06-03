import {
  cyclesFromParts,
  normalizePartsPerCycle,
  targetCycles,
  usesCycleQuantity
} from "./parts-per-cycle";

export type KanbanOperationQuantityInput = {
  targetQuantity?: number | null;
  quantity?: number | null;
  quantityCompleted?: number | null;
  quantityReworked?: number | null;
  quantityScrapped?: number | null;
  partsPerCycle?: unknown;
  timeBasis?: unknown;
};

export function getKanbanOperationQuantities(
  input: KanbanOperationQuantityInput
) {
  const partsPerCycle = normalizePartsPerCycle(input.partsPerCycle);
  const trackCycles = usesCycleQuantity(partsPerCycle, input.timeBasis);
  const targetParts = Number(input.targetQuantity ?? input.quantity ?? 0);
  const completedParts = Number(input.quantityCompleted ?? 0);
  const reworkedParts = Number(input.quantityReworked ?? 0);
  const scrappedParts = Number(input.quantityScrapped ?? 0);
  const targetCycleCount = targetCycles(targetParts, partsPerCycle);
  const completedCycleCount = cyclesFromParts(completedParts, partsPerCycle);
  const reworkedCycleCount = cyclesFromParts(reworkedParts, partsPerCycle);
  const scrappedCycleCount = cyclesFromParts(scrappedParts, partsPerCycle);

  const progressMax = trackCycles ? targetCycleCount : targetParts;
  const progressCompleted = trackCycles ? completedCycleCount : completedParts;

  return {
    trackCycles,
    partsPerCycle,
    targetParts,
    completedParts,
    reworkedParts,
    scrappedParts,
    targetCycleCount,
    completedCycleCount,
    progressMax,
    progressCompleted,
    segmentCompleted: trackCycles ? completedCycleCount : completedParts,
    segmentReworked: trackCycles ? reworkedCycleCount : reworkedParts,
    segmentScrapped: trackCycles ? scrappedCycleCount : scrappedParts
  };
}
