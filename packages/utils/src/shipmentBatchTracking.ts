import type { TrackedEntityAttributes } from "./types";

export function isSerialShipmentAssignment(
  attributes: TrackedEntityAttributes | null | undefined
): boolean {
  return attributes?.["Shipment Line Index"] !== undefined;
}

export function getShipmentBatchTrackingsForLine<
  T extends { attributes: unknown }
>(trackings: T[] | null | undefined, lineId: string): T[] {
  return (trackings ?? [])
    .filter((tracking) => {
      const attributes = tracking.attributes as TrackedEntityAttributes;
      return (
        attributes?.["Shipment Line"] === lineId &&
        !isSerialShipmentAssignment(attributes)
      );
    })
    .sort((a, b) => {
      const aIndex =
        (a.attributes as TrackedEntityAttributes)?.[
          "Shipment Line Batch Index"
        ] ?? 0;
      const bIndex =
        (b.attributes as TrackedEntityAttributes)?.[
          "Shipment Line Batch Index"
        ] ?? 0;
      return aIndex - bIndex;
    });
}

export function getBatchAllocatedQuantity(
  attributes: TrackedEntityAttributes | null | undefined,
  entityQuantity: number,
  lineShippedQuantity: number,
  batchAssignmentCount: number
): number {
  const explicit = attributes?.["Allocated Quantity"];
  if (
    explicit !== undefined &&
    explicit !== null &&
    Number.isFinite(Number(explicit))
  ) {
    return Number(explicit);
  }

  if (batchAssignmentCount <= 1) {
    return Math.min(lineShippedQuantity, entityQuantity);
  }

  return entityQuantity;
}

export function sumBatchAllocatedQuantities<
  T extends { attributes: unknown; quantity?: number | null }
>(trackings: T[], lineShippedQuantity: number): number {
  return trackings.reduce((sum, tracking) => {
    const attributes = tracking.attributes as TrackedEntityAttributes;
    return (
      sum +
      getBatchAllocatedQuantity(
        attributes,
        Number(tracking.quantity ?? 0),
        lineShippedQuantity,
        trackings.length
      )
    );
  }, 0);
}
