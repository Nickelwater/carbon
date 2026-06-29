import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Render the first page of a PDF to a PNG buffer at the target pixel size.
 * Uses pdfjs in Node (no Ghostscript).
 */
export async function pdfPageToPng(
  pdfBuffer: Buffer,
  widthPx: number,
  heightPx: number
): Promise<Buffer> {
  const doc = await getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true
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
