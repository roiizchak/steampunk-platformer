/** Typed view of `padAnchor.mjs`. See `png.d.mts` for why these are hand-written. */

import type { RgbaImage } from './png.d.mts';

export declare const DEFAULT_FILL: number;

export declare function padToFill(
  image: RgbaImage,
  options?: { fill?: number },
): RgbaImage;
