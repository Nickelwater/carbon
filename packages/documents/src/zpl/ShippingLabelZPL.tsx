import type { LabelSize } from "@carbon/utils";
import type { ShippingLabelItem } from "./shippingLabelTypes";
import {
  getZplLabelGeometry,
  isLandscapeZplLabel,
  zplLabelHeader
} from "./utils";

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
  return `^FO${x},${y}^A0N,${size},${Math.max(1, Math.round(size * widthMultiplier))}^FB${blockWidth},1,0,C^FD${zplEscape(text)}\\&^FS`;
}

function zplBarcode128(x: number, y: number, height: number, value: string) {
  if (!value.trim() || height < 8) return "";
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

/** Convert PDF points to ZPL dots at the label DPI. */
function ptToDots(points: number, dpi: number) {
  return Math.round((points * dpi) / 72);
}

/**
 * Vector ZPL fallback when PDF rasterization is unavailable. Prefer
 * `rasterizePdfToShippingLabelZpl` for print jobs — it matches the PDF preview.
 */
export function generateShippingLabelZPL(
  item: ShippingLabelItem,
  labelSize: LabelSize,
  logo?: { gfa?: string | null; widthDots?: number } | null
): string {
  const geometry = getZplLabelGeometry(labelSize);
  const { widthDots, heightDots } = geometry;
  const dpi = labelSize.zpl?.dpi ?? 203;
  const pt = (value: number) => ptToDots(value, dpi);

  const pad = pt(3);
  const cellPad = pt(4);
  const thin = Math.max(1, pt(1));

  const labelFont = pt(7);
  const valueFont = pt(9);
  const partTitleFont = pt(18);
  const addressFont = pt(11);
  const supplierFont = pt(9);
  const headerBarcodeH = pt(18);
  const rowBarcodeH = pt(14);

  const innerW = widthDots - pad * 2;
  const innerH = heightDots - pad * 2;

  const headerH = Math.round(innerH * 0.22);
  const bodyH = innerH - headerH;
  const leftW = Math.round(innerW * 0.58);
  const rightW = innerW - leftW;
  const footerH = Math.round(bodyH * 0.34);
  const rightBodyH = bodyH - footerH;
  const rowH = Math.floor(bodyH / 5);
  const shipSectionH = Math.round(rightBodyH * 0.48);
  const qrSize = Math.min(pt(68), footerH - pt(6));

  const bodyTop = pad + headerH;
  const leftX = pad;
  const rightX = pad + leftW;
  const footerTop = bodyTop + rightBodyH;

  let zpl = zplLabelHeader(geometry, {
    landscapeOnStock: isLandscapeZplLabel(labelSize)
  });

  zpl += zplBox(pad, bodyTop, innerW, thin, thin);
  zpl += zplBox(rightX, bodyTop, thin, bodyH, thin);

  const headerInnerX = pad + cellPad;
  const headerInnerW = innerW - cellPad * 2;

  zpl += zplText(headerInnerX, pad + cellPad, labelFont, "Part No:");

  const partNumberY = pad + cellPad + labelFont + pt(2);
  zpl += zplCenteredText(
    headerInnerX,
    partNumberY,
    headerInnerW,
    partTitleFont,
    item.partNumber
  );

  const partBarcodeY = partNumberY + partTitleFont + pt(2);
  const barcodeEstimate = item.partNumber.length * 11 + pt(24);
  const barcodeWidth = Math.round(headerInnerW * 0.65);
  const barcodeX =
    headerInnerX +
    Math.max(
      0,
      Math.floor((headerInnerW - Math.min(barcodeEstimate, barcodeWidth)) / 2)
    );
  zpl += zplBarcode128(barcodeX, partBarcodeY, headerBarcodeH, item.partNumber);

  const revY = bodyTop - labelFont - cellPad;
  zpl += zplText(headerInnerX, revY, labelFont, `Rev: ${item.revision || "—"}`);

  if (logo?.gfa) {
    const logoWidth = logo.widthDots ?? Math.round(rightW * 0.85);
    const logoX = pad + innerW - logoWidth - cellPad;
    zpl += `^FO${logoX},${pad + cellPad}${logo.gfa}^FS`;
  }

  const drawLeftRow = (
    rowIndex: number,
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
    const rowY = bodyTop + rowIndex * rowH;
    const x = leftX + cellPad;
    const showBarcode = options?.barcode !== false;
    const showBottomBorder = options?.showBottomBorder !== false;
    const labelY = rowY + pt(2);

    zpl += zplText(x, labelY, labelFont, `${label}:`);
    if (options?.secondLabel) {
      const midX = leftX + Math.round(leftW * 0.55);
      zpl += zplText(midX, labelY, labelFont, `${options.secondLabel}:`);
      zpl += zplText(x, labelY + labelFont + 1, valueFont, value);
      zpl += zplText(
        midX,
        labelY + labelFont + 1,
        valueFont,
        options.secondValue ?? ""
      );
    } else {
      zpl += zplText(x, labelY + labelFont + 1, valueFont, value);
    }

    if (showBarcode) {
      const barcodeY = labelY + labelFont + valueFont + pt(2);
      const available = rowY + rowH - barcodeY - pt(2);
      zpl += zplBarcode128(
        x,
        barcodeY,
        Math.max(8, Math.min(rowBarcodeH, available)),
        barcodeValue
      );
    }

    if (showBottomBorder) {
      zpl += zplBox(leftX, rowY + rowH - thin, leftW, thin, thin);
    }
  };

  drawLeftRow(0, "Description", item.description, "", { barcode: false });
  drawLeftRow(1, "QTY", item.quantity, item.quantityBarcode);
  drawLeftRow(2, "PO", item.purchaseOrder, item.purchaseOrder, {
    secondLabel: "Line",
    secondValue: item.lineNumber
  });
  drawLeftRow(
    3,
    "Packing List",
    item.packingListNumber,
    item.packingListNumber
  );
  drawLeftRow(4, "SO", item.salesOrderNumber, item.salesOrderNumber, {
    showBottomBorder: false
  });

  const shipX = rightX + cellPad;
  let shipY = bodyTop + cellPad;
  zpl += zplText(shipX, shipY, labelFont, "Ship To:");
  shipY += labelFont + 1;
  const shipLineStep = addressFont + 1;
  const maxShipLines = Math.max(
    1,
    Math.floor((shipSectionH - labelFont - pt(4)) / shipLineStep)
  );
  for (const line of item.shipToLines.slice(0, maxShipLines)) {
    zpl += zplText(shipX, shipY, addressFont, line);
    shipY += shipLineStep;
  }

  const supplierDividerY = bodyTop + shipSectionH;
  zpl += zplBox(rightX, supplierDividerY, rightW, thin, thin);

  let supplierY = supplierDividerY + thin + cellPad;
  zpl += zplText(shipX, supplierY, labelFont, "Supplier:");
  supplierY += labelFont + 1;
  const supplierLineStep = supplierFont + 1;
  const supplierAreaBottom = footerTop - cellPad;
  const maxSupplierLines = Math.max(
    1,
    Math.floor((supplierAreaBottom - supplierY) / supplierLineStep)
  );
  for (const line of item.supplierLines.slice(0, maxSupplierLines)) {
    zpl += zplText(shipX, supplierY, supplierFont, line);
    supplierY += supplierLineStep;
  }

  zpl += zplBox(rightX, footerTop, rightW, thin, thin);

  const metaX = shipX;
  const metaY = footerTop + cellPad;
  zpl += zplText(metaX, metaY, labelFont, `Date: ${item.shipDate}`);
  zpl += zplText(
    metaX,
    metaY + labelFont + pt(3),
    valueFont,
    `${item.packageIndex} of ${item.packageCount}`
  );

  const qrModule = Math.max(3, Math.min(6, Math.round(qrSize / 32)));
  const qrX = rightX + rightW - qrSize - cellPad;
  const qrY = footerTop + Math.round((footerH - qrSize) / 2);
  zpl += zplQr(qrX, qrY, qrModule, item.qrValue);

  zpl += "^XZ";
  return zpl;
}
