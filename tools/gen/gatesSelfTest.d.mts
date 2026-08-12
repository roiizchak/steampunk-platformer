/**
 * Typed view of `gatesSelfTest.mjs`. Re-exported through `gates.d.mts`, which is the type import
 * site every `.ts` file uses — this file exists because every `tools/gen/*.mjs` has a hand-written
 * `.d.mts` sibling.
 */

import type { RgbaImage } from './png.d.mts';

export declare function fill(
  image: RgbaImage,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): RgbaImage;
export declare function selfTest(): { gate: string; ok: boolean; detail: string }[];
