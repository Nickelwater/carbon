import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);

/** pdf.js needs bundled standard-font files to draw PDF base fonts (Helvetica, etc.). */
function getStandardFontDataUrl(): string {
  return `${path.join(
    path.dirname(require.resolve("pdfjs-dist/package.json")),
    "standard_fonts"
  )}${path.sep}`;
}

/**
 * Render the first page of a PDF to a PNG buffer at the target pixel size.
 * Uses pdfjs in Node (no Ghostscript).
 *
 * Shipping labels use PDF standard fonts (Helvetica). In Node, pdf.js must load
 * the bundled standard font pack and must not fall back to system fonts, or
 * rasterized ZPL typography diverges from the PDF preview.
 */
export async function pdfPageToPng(
  pdfBuffer: Buffer,
  widthPx: number,
  heightPx: number
): Promise<Buffer> {
  const doc = await getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: getStandardFontDataUrl(),
    disableFontFace: true,
    useSystemFonts: false
  }).promise;

  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    widthPx / baseViewport.width,
    heightPx / baseViewport.height
  );
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport
  }).promise;

  if (canvas.width !== widthPx || canvas.height !== heightPx) {
    const fitted = createCanvas(widthPx, heightPx);
    const fittedCtx = fitted.getContext("2d");
    fittedCtx.fillStyle = "white";
    fittedCtx.fillRect(0, 0, widthPx, heightPx);
    fittedCtx.drawImage(canvas, 0, 0, widthPx, heightPx);
    return fitted.toBuffer("image/png");
  }

  return canvas.toBuffer("image/png");
}
