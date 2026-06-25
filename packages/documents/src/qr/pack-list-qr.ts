/** Pack-list line QR date segment, e.g. `22-May-26`. */
export function formatPackListQrDate(dateString?: string | null): string {
  if (!dateString) return "";
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  const monthLabel = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
  return `${String(day).padStart(2, "0")}-${monthLabel}-${String(year).slice(-2)}`;
}

/**
 * Line-item QR payload:
 * `V<COMPANY>^P<PART>^Q<QTY>^A<PO>^S<PACK LIST>^D<DATE>^`
 */
export function buildPackListLineQrPayload(args: {
  companyName: string;
  partNumber: string;
  quantity: number;
  customerPo?: string;
  packListNumber?: string;
  date?: string | null;
}): string {
  const quantity = Number.isInteger(args.quantity)
    ? String(args.quantity)
    : String(args.quantity);

  return (
    `V${args.companyName}^` +
    `P${args.partNumber}^` +
    `Q${quantity}^` +
    `A${args.customerPo ?? ""}^` +
    `S${args.packListNumber ?? ""}^` +
    `D${formatPackListQrDate(args.date)}^`
  );
}
