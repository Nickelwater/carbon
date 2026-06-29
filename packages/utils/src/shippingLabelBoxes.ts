/**
 * Split a shipped quantity into per-label quantities using a fixed box size.
 * The last label may be a partial box when shipped quantity is not evenly divisible.
 *
 * @example
 * splitQuantityIntoBoxes(550, 250) // [250, 250, 50]
 * splitQuantityIntoBoxes(500, 250) // [250, 250]
 * splitQuantityIntoBoxes(50, 250)  // [50]
 */
export function splitQuantityIntoBoxes(
  shippedQuantity: number,
  boxQuantity: number
): number[] {
  if (!Number.isFinite(shippedQuantity) || shippedQuantity <= 0) {
    return [];
  }

  if (!Number.isFinite(boxQuantity) || boxQuantity <= 0) {
    return [shippedQuantity];
  }

  const fullBoxes = Math.floor(shippedQuantity / boxQuantity);
  const remainder = shippedQuantity % boxQuantity;
  const quantities: number[] = [];

  for (let i = 0; i < fullBoxes; i++) {
    quantities.push(boxQuantity);
  }

  if (remainder > 0) {
    quantities.push(remainder);
  }

  return quantities.length > 0 ? quantities : [shippedQuantity];
}

export function getShippingLabelPackageCount(
  shippedQuantity: number,
  boxQuantity: number | null | undefined
): number {
  if (!boxQuantity || boxQuantity <= 0) {
    return 1;
  }

  return splitQuantityIntoBoxes(shippedQuantity, boxQuantity).length;
}

/**
 * When false, shipping label loaders should expand to every box label.
 * Default modal values of 1/1 mean "print all", not "package 1 only".
 */
export function isSinglePackageShippingLabelRequest(
  packageIndex?: number,
  packageCount?: number
): boolean {
  if (packageIndex === undefined || packageCount === undefined) {
    return false;
  }

  return packageIndex > 1 || packageCount > 1 || packageIndex !== packageCount;
}
