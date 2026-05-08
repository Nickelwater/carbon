export type CustomerPartMapping = {
  itemId: string;
  customerPartId: string;
  customerPartRevision: string | null;
};

export function customerPartNumberLabel(cp: CustomerPartMapping): string {
  return cp.customerPartRevision
    ? `${cp.customerPartId}-${cp.customerPartRevision}`
    : cp.customerPartId;
}

export type ContractCustomerPartLabelResult =
  | { kind: "plain"; text: string }
  | { kind: "dual"; customerPn: string; internalPn: string };

export function resolveContractCustomerPartLabel(
  internalReadableId: string | undefined,
  options: {
    contractCustomer: boolean;
    customerParts: CustomerPartMapping[] | null | undefined;
    itemId: string | null | undefined;
  }
): ContractCustomerPartLabelResult | undefined {
  if (!internalReadableId) return undefined;
  if (
    !options.contractCustomer ||
    !options.itemId ||
    !options.customerParts?.length
  ) {
    return { kind: "plain", text: internalReadableId };
  }
  const len = options.customerParts.length;
  for (let i = 0; i < len; i++) {
    const cp = options.customerParts[i]!;
    if (cp.itemId === options.itemId) {
      return {
        kind: "dual",
        customerPn: customerPartNumberLabel(cp),
        internalPn: internalReadableId
      };
    }
  }
  return { kind: "plain", text: internalReadableId };
}

/** Plain string for non-React contexts. For UI use `ContractCustomerPartLabel`. */
export function contractCustomerPartDisplayLabel(
  internalReadableId: string | undefined,
  options: {
    contractCustomer: boolean;
    customerParts: CustomerPartMapping[] | null | undefined;
    itemId: string | null | undefined;
  }
): string | undefined {
  const r = resolveContractCustomerPartLabel(internalReadableId, options);
  if (!r) return undefined;
  if (r.kind === "plain") return r.text;
  return `${r.customerPn} (${r.internalPn})`;
}
