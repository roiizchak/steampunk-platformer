/**
 * Typed view of `touchInk.mjs` — the two pure pixel passes that make a generated engraving
 * readable over a level: thicken and keyline the mark, then fade only the brass.
 */

import type { RgbaImage } from './png.d.mts';

/** Luminance below which a pixel is dark ink, and above which it is pale ink. */
export const INK_DARK_MAX: number;
export const INK_LIGHT_MIN: number;

export function keylineMarks(face: RgbaImage): RgbaImage;
export function bakePlateAlpha(face: RgbaImage): RgbaImage;
