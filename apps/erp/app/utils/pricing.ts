/** Shape of a single price break tier */
export type PriceBreak = {
  quantity: number;
  unitPrice: number;
};

/** Pre-fetched supplier price data keyed by itemId */
export type SupplierPriceMap = Record<
  string,
  {
    priceBreaks: PriceBreak[];
    fallbackUnitPrice: number | null;
  }
>;

/**
 * Core sync lookup: given price break tiers and a requested quantity,
 * return the unit price from the highest qualifying tier
 * (where tier.quantity <= requestedQty). Falls back to fallbackPrice.
 */
export function lookupPriceFromBreaks(
  priceBreaks: PriceBreak[],
  requestedQty: number,
  fallbackPrice: number
): number {
  const eligible = priceBreaks.filter((pb) => pb.quantity <= requestedQty);
  if (eligible.length) {
    return eligible.reduce((best, pb) =>
      pb.quantity > best.quantity ? pb : best
    ).unitPrice;
  }
  return fallbackPrice;
}

/**
 * Map-aware wrapper: look up itemId in a SupplierPriceMap, then resolve
 * via lookupPriceFromBreaks. Used by useLineCosts for BOM tree costing.
 */
export function lookupBuyPriceFromMap(
  itemId: string,
  requestedQty: number,
  priceMap: SupplierPriceMap,
  fallbackCost: number
): number {
  const entry = priceMap[itemId];
  if (!entry) return fallbackCost;
  return lookupPriceFromBreaks(
    entry.priceBreaks,
    requestedQty,
    entry.fallbackUnitPrice ?? fallbackCost
  );
}

/**
 * Resolve the best supplier unit price for a quantity, applying exchange
 * rate conversion.
 */
export function resolveSupplierPrice(
  priceBreaks: PriceBreak[],
  quantity: number,
  fallbackUnitPrice: number,
  exchangeRate: number
): number {
  if (!priceBreaks.length) return fallbackUnitPrice;
  return (
    lookupPriceFromBreaks(
      priceBreaks,
      quantity,
      fallbackUnitPrice * exchangeRate
    ) / exchangeRate
  );
}
