export interface TrackedEntityAttributes {
  "Batch Number"?: string;
  Customer?: string;
  "Job Operation"?: string;
  "Job Operation Index"?: number;
  "Purchase Order"?: string;
  "Receipt Line Index"?: number;
  "Receipt Line"?: string;
  Receipt?: string;
  Supplier?: string;
  "Serial Number"?: string;
  "Shipment Line Index"?: number;
  "Shipment Line Batch Index"?: number;
  "Allocated Quantity"?: number;
  "Shipment Line"?: string;
  Shipment?: string;
  "Split Entity ID"?: string;
  Shelf?: string;
}

// used to generate sequences
export const interpolateSequenceDate = (value?: string | null) => {
  // replace all instances of %{year} with the current year
  if (!value) return "";
  let result = value;

  if (result.includes("%{")) {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const seconds = date.getSeconds();

    result = result.replace(/%{yyyy}/g, year.toString());
    result = result.replace(/%{yy}/g, year.toString().slice(-2));
    result = result.replace(/%{mm}/g, month.toString().padStart(2, "0"));
    result = result.replace(/%{dd}/g, day.toString().padStart(2, "0"));
    result = result.replace(/%{hh}/g, hours.toString().padStart(2, "0"));
    result = result.replace(/%{ss}/g, seconds.toString().padStart(2, "0"));
  }

  return result;
};

export const getReadableIdWithRevision = (
  readableId: string,
  revision?: string | null
) => {
  if (revision && revision !== "0") {
    return `${readableId}.${revision}`;
  }

  return readableId;
};

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export const credit = (accountType: AccountType, amount: number) => {
  switch (accountType) {
    case "asset":
    case "expense":
      return -amount;
    case "liability":
    case "equity":
    case "revenue":
      return amount;
    default:
      throw new Error(`Invalid account type: ${accountType}`);
  }
};

export const debit = (accountType: AccountType, amount: number) => {
  switch (accountType) {
    case "asset":
    case "expense":
      return amount;
    case "liability":
    case "equity":
    case "revenue":
      return -amount;
    default:
      throw new Error(`Invalid account type: ${accountType}`);
  }
};

export const journalReference = {
  to: {
    purchaseInvoice: (id: string) => `purchase-invoice:${id}`,
    receipt: (id: string) => `receipt:${id}`,
    salesInvoice: (id: string) => `sales-invoice:${id}`,
    shipment: (id: string) => `shipment:${id}`,
    job: (id: string) => `job:${id}`,
    materialIssue: (id: string) => `material-issue:${id}`,
  },
};

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
