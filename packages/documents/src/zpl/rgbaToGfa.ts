const HEX = "0123456789ABCDEF";

/** Pack monochrome RGBA into a ZPL ^GFA graphic field (MSB-first, 1 = black). */
export function rgbaToGfa(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128
): string {
  const rowBytes = Math.ceil(width / 8);
  const total = rowBytes * height;
  const bytes = new Uint8Array(total);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3];
      const lum =
        alpha === 0
          ? 255
          : rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      if (lum < threshold) {
        bytes[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  let hex = "";
  for (let k = 0; k < total; k++) {
    hex += HEX[bytes[k] >> 4] + HEX[bytes[k] & 15];
  }

  return `^GFA,${total},${total},${rowBytes},${hex}`;
}
