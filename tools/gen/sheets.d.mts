/** Typed view of `sheets.mjs`. See `png.d.mts` for why these declarations are hand-written. */

import type { RgbaImage } from './png.d.mts';

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FigureMetrics {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centroidX: number;
  centroidY: number;
  pixels: number;
}

/**
 * Which landmark a sheet's frames are aligned on. `feet` when the ART puts the character on the
 * floor; `centroid` when the SIM owns altitude, i.e. `jump` and `fall`.
 */
export type VerticalAnchor = 'feet' | 'centroid';

export interface PackedFrame {
  index: number;
  sourceWidth: number;
  sourceHeight: number;
  drawnWidth: number;
  drawnHeight: number;
  pixels: number;
  /**
   * Game pixels this frame sits ABOVE the sheet's contact line. Zero on the deepest frame; the
   * measured, scaled inter-frame lift on every other. This is the number the lift-profile manifest
   * carries and criterion 4.19 asserts.
   */
  liftPx: number;
  sourceMaxY: number;
  sourceCentroidY: number;
}

export declare function detectFrames(
  keyed: RgbaImage,
  options?: { minGap?: number; minExtent?: number },
): FrameRect[];

export declare function assertSingleRowLayout(rects: FrameRect[]): void;
export declare function splitGrid(image: RgbaImage, cols: number, rows: number): RgbaImage[];
export declare function figureMetrics(image: RgbaImage, alphaFloor?: number): FigureMetrics | null;
export declare function keyCell(cell: RgbaImage): RgbaImage;
export declare function deriveScale(standingHeightPx: number, renderHeightPx: number): number;

export declare function frameLifts(
  cells: RgbaImage[],
  metrics: FigureMetrics[],
  scale: number,
  anchor?: VerticalAnchor,
): number[];

export declare function packStrip(
  cells: RgbaImage[],
  options: {
    scale: number;
    frameWidth: number;
    frameHeight: number;
    baselineY: number;
    anchor?: VerticalAnchor;
  },
): { strip: RgbaImage; frames: PackedFrame[]; deepestSourceY: number };
