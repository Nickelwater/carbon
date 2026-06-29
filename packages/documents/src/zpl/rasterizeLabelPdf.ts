import type { LabelSize } from "@carbon/utils";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { pdfPageToPng } from "./pdfPageToPng";
import { rgbaToGfa } from "./rgbaToGfa";

async function pngToGfa(pngBuffer: Buffer, threshold = 128): Promise<string> {
  const image = await loadImage(pngBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    image.width,
    image.height
  );
  return rgbaToGfa(data, width, height, threshold);
}

async function rotateLandscapePng90Cw(
  pngBuffer: Buffer,
  landscapeW: number,
  landscapeH: number
): Promise<Buffer> {
  const image = await loadImage(pngBuffer);
  const physicalW = landscapeH;
  const physicalH = landscapeW;
  const canvas = createCanvas(physicalW, physicalH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, physicalW, physicalH);
  ctx.translate(physicalW, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(image, 0, 0, landscapeW, landscapeH);
  return canvas.toBuffer("image/png");
}

/**
 * Rasterize a landscape label PDF to ZPL on physical 4"x6" stock.
 * Renders PDF → PNG in Node (pdfjs), rotates for the print head, converts to ^GFA.
 */
export async function rasterizePdfToShippingLabelZpl(
  pdfBuffer: Buffer,
  labelSize: LabelSize
): Promise<string> {
  const dpi = labelSize.zpl?.dpi ?? 203;
  const landscapeW = Math.round(
    (labelSize.zpl?.width ?? labelSize.width) * dpi
  );
  const landscapeH = Math.round(
    (labelSize.zpl?.height ?? labelSize.height) * dpi
  );
  const physicalW = landscapeH;
  const physicalH = landscapeW;

  const landscapePng = await pdfPageToPng(pdfBuffer, landscapeW, landscapeH);
  const physicalPng = await rotateLandscapePng90Cw(
    landscapePng,
    landscapeW,
    landscapeH
  );
  const gfa = await pngToGfa(physicalPng);

  return `^XA^PW${physicalW}^LL${physicalH}^MNN^CI28^PQ1^FO0,0${gfa}^FS^XZ`;
}
