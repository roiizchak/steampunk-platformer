/**
 * Typed view of `assetSources.mjs` — source resolution, keying, and cutting a strip into frames.
 *
 * Written when `clip-cell-pitch.test.ts` first imported from this module: every `tools/gen/*.mjs`
 * has a hand-written `.d.mts` sibling, and this one had none because nothing typed had needed it.
 */

import type { RgbaImage } from './png.d.mts';

export declare function findSource(generated: string, slug: string, action: string): string;

export declare function loadConfig(configPath: string): Record<string, unknown>;

export declare function keySheet(path: string): {
  decoded: RgbaImage;
  keyed: RgbaImage;
  key: [number, number, number];
  agreement: number;
};

/**
 * Split a strip at a pitch the producer declared, cropping each cell to its own content within one
 * shared row band. Throws on a width that is not a whole multiple of the pitch, and on an empty cell.
 */
export declare function splitAtPitch(keyed: RgbaImage, cellWidth: number): RgbaImage[];

/** The declared cell pitch for a clip strip, or `null` when the strip predates the sidecar. */
export declare function cellPitchFor(sourcePath: string): number | null;

/** Cut a keyed strip into frames — at `cellWidth` when given, otherwise by band detection. */
export declare function framesOf(keyed: RgbaImage, cellWidth?: number | null): RgbaImage[];

export declare function sliceFrame(
  strip: RgbaImage,
  index: number,
  frameWidth: number,
  frameHeight: number,
): RgbaImage;
