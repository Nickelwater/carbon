import type { LabelSize } from "@carbon/utils";
import type { ShippingLabelItem } from "./shippingLabelTypes";
import { getZplLabelGeometry, zplLabelHeader } from "./utils";

function zplEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\^/g, "\\^").replace(/~/g, "\\~");
}

function zplText(
  x: number,
  y: number,
  size: number,
  text: string,
  widthMultiplier = 1
): string {
  return `^FO${x},${y}^A0N,${size},${Math.max(1, Math.round(size * widthMultiplier))}^FD${zplEscape(text)}^FS`;
}

function zplCenteredText(
  x: number,
  y: number,
  blockWidth: number,
  size: number,
  text: string,
  widthMultiplier = 1
): string {
  return `^FO${x},${y}^A0N,${size},${Math.max(1, Math.round(size * widthMultiplier))}^FB${blockWidth},1,0,C^FD${zplEscape(text)}^FS`;
}

function zplBarcode128(x: number, y: number, height: number, value: string) {
  if (!value.trim()) return "";
  return `^FO${x},${y}^BY2,2,${height}^BCN,${height},N,N,N^FD${zplEscape(value)}^FS`;
}

function zplQrFieldData(value: string): string {
  let encoded = "";
  for (const char of value) {
    if (char === "_") encoded += "_5F";
    else if (char === "^") encoded += "_5E";
    else encoded += char;
  }
  return encoded;
}

function zplQr(x: number, y: number, module: number, value: string) {
  if (!value.trim()) return "";
  return `^FO${x},${y}^BQN,2,${module}^FH\\^FDMA,${zplQrFieldData(value)}^FS`;
}

function zplBox(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness = 2
) {
  return `^FO${x},${y}^GB${width},${height},${thickness},B,0^FS`;
}

/**
 * 6x4 landscape customer shipping label with part number, PO/line, packing list,
 * ship-to, and QR code. Layout matches Adams Die Cast-style thermal labels.
 */
export function generateShippingLabelZPL(
  item: ShippingLabelItem,
  labelSize: LabelSize,
  logo?: { gfa?: string | null; widthDots?: number } | null
): string {
  const geometry = getZplLabelGeometry(labelSize);
  const { widthDots, heightDots, scale, margin } = geometry;

  const thin = Math.max(2, Math.round(2 * scale));
  const labelFont = Math.round(16 * scale);
  const valueFont = Math.round(22 * scale);
  const addressFont = Math.round(24 * scale);
  const supplierFont = Math.round(20 * scale);
  const partTitleFont = Math.round(36 * scale);
  const barcodeHeight = Math.round(36 * scale);

  const innerPad = Math.round(8 * scale);
  const innerWidth = widthDots - margin * 2;
  const leftWidth = Math.round(innerWidth * 0.58);
  const rightX = margin + leftWidth;
  const rightWidth = innerWidth - leftWidth;
  const contentRight = widthDots - margin;
  const contentBottom = heightDots - margin;

  let zpl = zplLabelHeader(geometry);

  const headerHeight = Math.round(heightDots * 0.24);
  const footerHeight = Math.round(heightDots * 0.32);
  const topY = margin;
  const splitY = topY + headerHeight;
  const footerY = contentBottom - footerHeight;

  // Internal dividers only (no outer border, no header split)
  zpl += zplBox(margin, splitY, widthDots - margin * 2, thin, thin);
  zpl += zplBox(rightX, splitY, thin, contentBottom - splitY, thin);

  const headerInnerWidth = widthDots - margin * 2 - innerPad * 2;
  const partBlockX = margin + innerPad;

  // Part number header
  zpl += zplText(partBlockX, topY + innerPad, labelFont, "Part No:");

  const partNumberY = topY + innerPad + labelFont + 6;
  zpl += zplCenteredText(
    partBlockX,
    partNumberY,
    headerInnerWidth,
    partTitleFont,
    item.partNumber,
    1.25
  );

  const partBarcodeY = partNumberY + partTitleFont + 8;
  const barcodeEstimate = item.partNumber.length * 22 + 48;
  const barcodeX =
    partBlockX +
    Math.max(0, Math.floor((headerInnerWidth - barcodeEstimate) / 2));
  zpl += zplBarcode128(barcodeX, partBarcodeY, barcodeHeight, item.partNumber);

  const revY = splitY - labelFont - innerPad;
  zpl += zplText(partBlockX, revY, labelFont, `Rev: ${item.revision || "—"}`);

  // Company symbol/mark logo (top-right)
  if (logo?.gfa) {
    const logoWidth = logo.widthDots ?? Math.round(headerInnerWidth * 0.28);
    const logoX = contentRight - logoWidth;
    zpl += `^FO${logoX},${topY + innerPad}${logo.gfa}^FS`;
  }

  const bodyTop = splitY + innerPad;
  const bodyBottom = footerY - innerPad;
  const leftRows = 5;
  const rowHeight = Math.floor((bodyBottom - bodyTop) / leftRows);
  let rowY = bodyTop;

  const drawLeftRow = (
    label: string,
    value: string,
    barcodeValue: string,
    options?: {
      secondLabel?: string;
      secondValue?: string;
      barcode?: boolean;
      showBottomBorder?: boolean;
    }
  ) => {
    const x = margin + innerPad;
    const showBarcode = options?.barcode !== false;
    const showBottomBorder = options?.showBottomBorder !== false;
    zpl += zplText(x, rowY, labelFont, `${label}:`);
    if (options?.secondLabel) {
      const midX = margin + Math.round(leftWidth * 0.45);
      zpl += zplText(midX, rowY, labelFont, `${options.secondLabel}:`);
      zpl += zplText(x, rowY + labelFont + 2, valueFont, value);
      zpl += zplText(
        midX,
        rowY + labelFont + 2,
        valueFont,
        options.secondValue ?? ""
      );
    } else {
      zpl += zplText(x, rowY + labelFont + 2, valueFont, value);
    }
    if (showBarcode) {
      zpl += zplBarcode128(
        x,
        rowY + labelFont + valueFont + 6,
        Math.min(barcodeHeight, rowHeight - labelFont - valueFont - 12),
        barcodeValue
      );
    }
    if (showBottomBorder) {
      zpl += zplBox(margin, rowY + rowHeight - thin, leftWidth, thin, thin);
    }
    rowY += rowHeight;
  };

  drawLeftRow("Description", item.description, "", { barcode: false });
  drawLeftRow("QTY", item.quantity, item.quantityBarcode);
  drawLeftRow("PO", item.purchaseOrder, item.purchaseOrder, {
    secondLabel: "Line",
    secondValue: item.lineNumber
  });
  drawLeftRow("Packing List", item.packingListNumber, item.packingListNumber);
  drawLeftRow("SO", item.salesOrderNumber, item.salesOrderNumber, {
    showBottomBorder: false
  });

  // Ship To + Supplier (right column)
  const rightBodyHeight = footerY - splitY;
  const shipSectionHeight = Math.round(rightBodyHeight * 0.48);
  const shipSupplierDividerY = splitY + shipSectionHeight;
  zpl += zplBox(rightX, shipSupplierDividerY, rightWidth, thin, thin);

  const shipX = rightX + innerPad;
  let shipY = splitY + innerPad;
  zpl += zplText(shipX, shipY, labelFont, "Ship To:");
  shipY += labelFont + 4;
  for (const line of item.shipToLines) {
    zpl += zplText(shipX, shipY, addressFont, line);
    shipY += addressFont + 2;
  }

  let supplierY = shipSupplierDividerY + thin + innerPad;
  zpl += zplText(shipX, supplierY, labelFont, "Supplier:");
  supplierY += labelFont + 4;
  for (const line of item.supplierLines) {
    zpl += zplText(shipX, supplierY, supplierFont, line);
    supplierY += supplierFont + 2;
  }

  // Footer metadata + QR
  zpl += zplBox(margin, footerY, widthDots - margin * 2, thin, thin);

  const metaX = rightX + innerPad;
  const metaY = footerY + innerPad;
  zpl += zplText(metaX, metaY, labelFont, `Date: ${item.shipDate}`);
  zpl += zplText(
    metaX,
    metaY + labelFont + 6,
    valueFont,
    `${item.packageIndex} of ${item.packageCount}`
  );

  const qrModule = Math.max(4, Math.min(7, Math.round(5 * scale)));
  const qrSize = qrModule * 29;
  const qrX = contentRight - qrSize - innerPad;
  const qrY = footerY + Math.round((footerHeight - qrSize) / 2);
  zpl += zplQr(qrX, qrY, qrModule, item.qrValue);

  zpl += "^XZ";
  return zpl;
}
