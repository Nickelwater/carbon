import bwipjs from "@bwip-js/node";

export type BarcodeSymbology = "pdf417" | "code128" | "datamatrix" | "qrcode";

export type BarcodeOptions = {
  scale?: number;
  /** Horizontal module width only (narrower bars without changing height). */
  scaleX?: number;
  scaleY?: number;
  height?: number;
  /** Target width in millimeters; bwip-js scales modules down to fit (linear codes). */
  width?: number;
  includetext?: boolean;
};

const SQUARE_SYMBOLOGIES = new Set<BarcodeSymbology>(["datamatrix", "qrcode"]);

/**
 * Render a barcode to a base64 PNG data URL. react-pdf's `<Image src>` resolves
 * the returned promise, so it can be used directly in JSX. Mirrors
 * `generateQRCode` but with a selectable symbology.
 */
export async function generateBarcode(
  text: string,
  symbology: BarcodeSymbology,
  opts: BarcodeOptions = {}
): Promise<string> {
  const isSquare = SQUARE_SYMBOLOGIES.has(symbology);
  const buffer = await bwipjs.toBuffer({
    bcid: symbology,
    text: text || " ",
    ...(opts.scaleX != null
      ? { scaleX: opts.scaleX, scaleY: opts.scaleY ?? opts.scaleX }
      : { scale: opts.scale ?? 3 }),
    // `height` distorts 2D square codes (QR / DataMatrix) — only set it for the
    // linear/stacked symbologies that need a bar height.
    ...(opts.height && !isSquare ? { height: opts.height } : {}),
    // Cap total symbol width so long Code128 strings stay scannable but compact.
    ...(opts.width && !isSquare ? { width: opts.width } : {}),
    includetext: opts.includetext ?? false,
    textxalign: "center"
  });
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
