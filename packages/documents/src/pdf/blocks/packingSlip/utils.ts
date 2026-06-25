import {
  DEFAULT_PACKING_SLIP_COLUMN_INSET,
  type PackingSlipColumnInset
} from "../../../template";

export {
  buildPackListLineQrPayload,
  formatPackListQrDate
} from "../../../qr/pack-list-qr";

/** Split `readableIdWithRevision` into part number and revision. */
export function splitPartAndRevision(itemReadableId: string): {
  partNo: string;
  revision: string;
} {
  const lastDot = itemReadableId.lastIndexOf(".");
  if (lastDot > 0) {
    return {
      partNo: itemReadableId.slice(0, lastDot),
      revision: itemReadableId.slice(lastDot + 1)
    };
  }
  return { partNo: itemReadableId, revision: "" };
}

/** Format customer PO and line number like `51359 / 006`. */
export function formatPurchaseOrderLine(
  customerReference?: string,
  lineNumber?: number | null
): string | undefined {
  if (!customerReference) return undefined;
  if (lineNumber == null) return customerReference;
  return `${customerReference} / ${String(lineNumber).padStart(3, "0")}`;
}

export type PackingSlipPartIdentity = {
  partNumber: string;
  revision: string;
};

/** Prefer mapped customer part number/revision when present on the line. */
export function resolvePackingSlipPartIdentity(
  line: { id?: string | null; itemReadableId?: string | null },
  lineCustomerParts?: Record<string, PackingSlipPartIdentity>
): PackingSlipPartIdentity {
  const customerPart = line.id ? lineCustomerParts?.[line.id] : undefined;
  if (customerPart) return customerPart;
  const { partNo, revision } = splitPartAndRevision(line.itemReadableId ?? "");
  return { partNumber: partNo, revision };
}

/** Narrow Code128 tuned for packing-slip columns (mm widths, scaleX=1 modules). */
export const PACKING_SLIP_CODE128 = {
  header: { scaleX: 1, height: 7, width: 40 },
  lineItem: { scaleX: 1, height: 6, width: 34 },
  lineItemPo: { scaleX: 1, height: 6, width: 38 },
  quantity: { scaleX: 1, height: 6, width: 18 }
} as const;

const PACKING_SLIP_COLUMN_WIDTHS = {
  part: "20%",
  desc: "35%",
  qty: "11%",
  po: "24%",
  qr: "10%"
} as const;

/** Merges saved template options with packing-slip column inset defaults. */
export function resolvePackingSlipColumnInset(
  partial?: Partial<PackingSlipColumnInset>
): PackingSlipColumnInset {
  return {
    ...DEFAULT_PACKING_SLIP_COLUMN_INSET,
    ...partial
  };
}

/** Column layout for the packing slip line-items table (inset in pt before each column). */
export function buildPackingSlipColumnStyles(
  insets: ReturnType<typeof resolvePackingSlipColumnInset>
) {
  return {
    part: {
      width: PACKING_SLIP_COLUMN_WIDTHS.part,
      paddingLeft: Math.max(0, insets.part)
    },
    desc: {
      width: PACKING_SLIP_COLUMN_WIDTHS.desc,
      paddingLeft: Math.max(0, insets.description)
    },
    qty: {
      width: PACKING_SLIP_COLUMN_WIDTHS.qty,
      paddingLeft: Math.max(0, insets.quantity)
    },
    po: {
      width: PACKING_SLIP_COLUMN_WIDTHS.po,
      paddingLeft: Math.max(0, insets.purchaseOrder)
    },
    qr: {
      width: PACKING_SLIP_COLUMN_WIDTHS.qr,
      paddingLeft: Math.max(0, insets.qr)
    }
  } as const;
}
