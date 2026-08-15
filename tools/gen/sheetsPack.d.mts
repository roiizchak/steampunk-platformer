/**
 * Typed view of `sheetsPack.mjs`. Re-exported through `sheets.d.mts`, which is the type import
 * site every `.ts` file uses — this file exists because every `tools/gen/*.mjs` has a hand-written
 * `.d.mts` sibling.
 */

import type { RgbaImage } from './png.d.mts';
import type { FigureMetrics, PackedFrame, VerticalAnchor } from './sheets.d.mts';

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
