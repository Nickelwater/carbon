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
      const alpha = rgba[i + 3] ?? 0;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      const lum = alpha === 0 ? 255 : r * 0.299 + g * 0.587 + b * 0.114;
      if (lum < threshold) {
        const byteIndex = y * rowBytes + (x >> 3);
        bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }

  let hex = "";
  for (let k = 0; k < total; k++) {
    const b = bytes[k] ?? 0;
    hex += HEX.charAt(b >> 4) + HEX.charAt(b & 15);
  }

  return `^GFA,${total},${total},${rowBytes},${hex}`;
}
