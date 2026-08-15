/**
 * Typed view of `gatesBrassCap.mjs`. Re-exported through `gates.d.mts`, which is the type import
 * site every `.ts` file uses — this file exists because every `tools/gen/*.mjs` has a hand-written
 * `.d.mts` sibling.
 */

import type { RgbaImage } from './png.d.mts';
import type { Verdict } from './gates.d.mts';

export declare function regionStats(
  image: RgbaImage,
  region?: { x?: number; y?: number; w?: number; h?: number },
): { saturation: number; value: number; pixels: number };
export declare const WARM: Readonly<{
  MIN_ALPHA: number;
  MIN_RED: number;
  RED_OVER_BLUE: number;
  GREEN_OVER_BLUE: number;
  CAP_BAND: number;
  CAP_MIN_FRACTION: number;
  CAP_TOP_SHARE: number;
  PLAIN_MAX_FRACTION: number;
}>;
export declare function gateBrassCap(
  image: RgbaImage,
  expect: 'capped' | 'plain',
  region?: { x?: number; y?: number; w?: number; h?: number },
): Verdict<{
  opaque: number;
  opaqueFraction: number;
  warm: number;
  warmFraction: number;
  topShare: number;
} | null>;
