/**
 * Typed view of `resize.mjs` — the box filter every generated image is reduced through.
 *
 * Typed so `shipped-touch.test.ts` can measure contrast at true on-screen size through the SAME
 * partitioning production uses, rather than through a second box filter rolled by hand: the two
 * disagreed about which source columns fall in the first destination cell.
 */

import type { RgbaImage } from './png.d.mts';

export function crop(
  image: RgbaImage,
  x: number,
  y: number,
  width: number,
  height: number,
): RgbaImage;
export function downscale(image: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage;
export function downscaleToWidth(image: RgbaImage, targetWidth: number): RgbaImage;
