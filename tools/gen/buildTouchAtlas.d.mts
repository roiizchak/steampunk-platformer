/**
 * Typed view of `buildTouchAtlas.mjs` — the plate → six 160 × 160 faces cut.
 *
 * `isCliEntry` is exported and typed so a unit test can drive the entry-point comparison with a
 * path containing a space, which is the defect that made `npm run assets:touch` a silent no-op.
 */

import type { RgbaImage } from './png.d.mts';

export const TOUCH_PLATE_SOURCE: string;
export const TOUCH_PLATE_SHEET_ROWS: number;
export const TOUCH_FACE_PX: number;
export const TOUCH_OUT_DIR: string;
export const TOUCH_CUT_DIR: string;

export function cutFace(cell: RgbaImage, key: string): RgbaImage;
export function cutPlate(bytes: Uint8Array): {
  cells: Map<string, RgbaImage>;
  width: number;
  height: number;
};
export function staleFaces(
  files: string[],
  produced: { has(key: string): boolean },
): string[];
export function isCliEntry(argv1: string | undefined, moduleUrl: string): boolean;
