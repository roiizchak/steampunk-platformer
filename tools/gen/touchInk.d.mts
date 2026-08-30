/**
 * Typed view of `touchInk.mjs` — the two pure pixel passes that make a generated engraving
 * readable over a level: thicken and keyline the mark, then fade everything that is not it.
 */

import type { RgbaImage } from './png.d.mts';

/** Luminance below which a pixel of the cut face is a dark engraving to be thickened. */
export const INK_DARK_MAX: number;

/** What the plate's alpha is multiplied by, so that the DRAWN alpha times this is `PLATE_ALPHA`. */
export const PLATE_ALPHA_BAKED: number;

export function keylineMarks(face: RgbaImage): { image: RgbaImage; mark: Uint8Array };
export function bakePlateAlpha(face: RgbaImage, mark: Uint8Array): RgbaImage;
