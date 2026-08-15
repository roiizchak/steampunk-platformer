import type { RgbaImage } from '../../tools/gen/png.d.mts';

/**
 * Pixel-measurement helpers for sheet-packing.test.ts, extracted when that file crossed 400 lines.
 *
 * DATA AND SETUP ONLY — no `expect` lives here; every assertion stays in the test file.
 */

/** A cell of `w x h` holding one solid opaque block spanning rows `top..bottom` inclusive. */
export function cellWithFigure(w: number, h: number, top: number, bottom: number, x0 = 4, x1 = 11): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * w + x) * 4;
      data[i] = 200;
      data[i + 1] = 120;
      data[i + 2] = 60;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Vertical centre of mass of one packed cell, in strip coordinates. */
export function centroidYOf(strip: RgbaImage, index: number, frameWidth: number): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = index * frameWidth; x < (index + 1) * frameWidth; x += 1) {
      if (strip.data[(y * strip.width + x) * 4 + 3] >= 8) {
        sum += y;
        n += 1;
      }
    }
  }
  if (n === 0) throw new Error(`centroidYOf: frame ${index} is empty`);
  return sum / n;
}

/** Rows of fully transparent pixels between the figure's lowest opaque row and the cell's bottom. */
export function gapBelowFeet(strip: RgbaImage, index: number, frameWidth: number): number {
  for (let y = strip.height - 1; y >= 0; y -= 1) {
    for (let x = index * frameWidth; x < (index + 1) * frameWidth; x += 1) {
      if (strip.data[(y * strip.width + x) * 4 + 3] >= 8) return strip.height - 1 - y;
    }
  }
  throw new Error(`gapBelowFeet: frame ${index} is empty`);
}
