import type { Database } from "@carbon/database";

function formatCustomerPartNumber(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  if (!line.customerPartId) return "";
  return (
    line.customerPartId +
    (line.customerPartRevision ? ` Rev ${line.customerPartRevision}` : "")
  );
}

export function getLineDescription(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  switch (line?.salesOrderLineType) {
    case "Fixed Asset":
      return (
        (line as any)?.assetReadableId ??
        (line as any)?.assetName ??
        "Fixed Asset"
      );
    case "Comment":
      return line?.description;
    default: {
      const customerPn = formatCustomerPartNumber(line);
      if (customerPn) return customerPn;
      return line?.itemReadableId ?? "";
    }
  }
}

export function getLineDescriptionDetails(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  switch (line?.salesOrderLineType) {
    case "Fixed Asset":
      return line?.description;
    case "Comment":
    default:
      return line?.description ?? "";
  }
}

export function getLineSubtotal(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  if (line?.saleQuantity && line?.convertedUnitPrice) {
    return (
      line.saleQuantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedNonTaxableAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxableSubtotal(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  if (line?.saleQuantity && line?.convertedUnitPrice) {
    return (
      line.saleQuantity * line.convertedUnitPrice +
      (line.convertedAddOnCost ?? 0) +
      (line.convertedShippingCost ?? 0)
    );
  }
  return 0;
}

export function getLineTaxesAndFees(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  const taxPercent = line.taxPercent ?? 0;
  const tax = getLineTaxableSubtotal(line) * taxPercent;
  const fees =
    (line.convertedAddOnCost ?? 0) +
    (line.convertedNonTaxableAddOnCost ?? 0) +
    (line.convertedShippingCost ?? 0);
  return tax + fees;
}

export function getLineTotal(
  line: Database["public"]["Views"]["salesOrderLines"]["Row"]
) {
  const taxPercent = line.taxPercent ?? 0;
  const tax = getLineTaxableSubtotal(line) * taxPercent;
  return getLineSubtotal(line) + tax;
}

export function getTotal(
  lines: Database["public"]["Views"]["salesOrderLines"]["Row"][],
  salesOrder: Database["public"]["Views"]["salesOrders"]["Row"]
) {
  let total = 0;

  lines.forEach((line) => {
    total += getLineTotal(line);
  });

  return (
    total + (salesOrder.shippingCost ?? 0) * (salesOrder.exchangeRate ?? 1)
  );
}
