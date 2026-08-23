/** Typed view of `gates.mjs`. See `png.d.mts` for why these declarations are hand-written. */

import type { RgbaImage } from './png.d.mts';

export type GateStatus = 'PASS' | 'FAIL' | 'INDETERMINATE';

export interface Verdict<T = unknown> {
  status: GateStatus;
  value: T;
  reason: string;
}

export declare const PASS: 'PASS';
export declare const FAIL: 'FAIL';
export declare const INDETERMINATE: 'INDETERMINATE';
export declare const MOTION_FLOOR: number;
export declare const BLIND_SPOTS: readonly string[];

export declare function gateDimensions(
  buffer: Uint8Array,
  expected?: { width: number; height: number },
): Verdict<{ width: number; height: number; ratio: number }>;

export declare function gateAlpha(
  buffer: Uint8Array,
): Verdict<{ channelPresent: boolean; realTransparency: boolean }>;

export declare function frameDifference(a: RgbaImage, b: RgbaImage): number;
export declare function gateMotionFloor(frames: RgbaImage[], floor?: number): Verdict<number | null>;

export declare function gateLoopWrap(
  frames: RgbaImage[],
  slack?: number,
): Verdict<{ wrap: number; medianStep: number; largestStep: number; budget: number } | null>;
export declare function gateReachBand(
  frames: RgbaImage[],
  threshold?: number,
): Verdict<{ frame: number; reachX: number; top: number; bottom: number; movedPx: number } | null>;
export declare function gateGridExact(
  image: { width: number; height: number },
  cell: number,
): Verdict<{ width: number; height: number; cell: number; cols?: number; rows?: number }>;
export declare function gateSeam(
  image: RgbaImage,
  slack?: number,
): Verdict<{ wrap: number; medianStep: number; budget: number } | null>;
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
export declare function summarise(results: Record<string, Verdict>): Verdict;
export declare function fill(
  image: RgbaImage,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): RgbaImage;
export declare function selfTest(): { gate: string; ok: boolean; detail: string }[];
