/**
 * Typed view of `touchPlateCut.mjs` — the pure plate geometry, split out of the builder.
 *
 * `extractPlateCell` is exported and typed because a reference image for an image-to-image edit
 * wants the model's own pixels at the model's own resolution, and every other path here has
 * already keyed, cropped and downscaled them away.
 */

import type { RgbaImage } from './png.d.mts';

export const TOUCH_PLATE_SHEET_ROWS: number;
export const TOUCH_FACE_PX: number;

export function cutFace(cell: RgbaImage, key: string): RgbaImage;

/** Raw cells, pre-keying and pre-downscale, keyed by control. */
export function plateCells(bytes: Uint8Array): {
  cells: Map<string, RgbaImage>;
  width: number;
  height: number;
};

export function extractPlateCell(bytes: Uint8Array, key: string): RgbaImage;

export function cutPlate(bytes: Uint8Array): {
  cells: Map<string, RgbaImage>;
  width: number;
  height: number;
};

export function measurePlateRows(keyed: import('./png.d.mts').RgbaImage): number;
