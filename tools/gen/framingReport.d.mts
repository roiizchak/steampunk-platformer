/** Typed view of `framingReport.mjs` — work item A-T2. See `png.d.mts` for why these are hand-written. */

import type { RgbaImage } from './png.d.mts';

export interface EdgeMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FramingMeasurement {
  key: number[];
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  margins: EdgeMargins;
  marginsPct: EdgeMargins;
  figure: { wFrac: number; hFrac: number };
}

export declare const EXPECTED_CLIP_COUNT: number;
export declare const FRAMES_PER_CLIP: number;

export declare function slugForClip(name: string): string;
export declare function sampleIndices(total: number, n?: number): number[];
export declare function assertClipCount(
  clips: readonly { path: string }[],
  expected?: number,
): void;
export declare function measureFraming(image: RgbaImage): FramingMeasurement;
