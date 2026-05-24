/** True when the lot is tracked as batch quantity on one or few entities. */
export function isBatchInspectionLot(
  lotEntities: { quantity?: number | string | null }[]
): boolean {
  return lotEntities.some((e) => Number(e.quantity ?? 1) > 1);
}

export function batchSamplesRemaining(
  sampleSize: number,
  inspectedCount: number
): number {
  return Math.max(0, sampleSize - inspectedCount);
}
