/** Typed view of `edgeGate.mjs` — guard G6. See `png.d.mts` for why these are hand-written. */

import type { RgbaImage } from './png.d.mts';
import type { Verdict } from './gates.d.mts';

export interface EdgeMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface EdgeBleed {
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  margins: EdgeMargins;
  marginPx: number;
}

export declare const DEFAULT_MARGIN_PX: number;

export declare function gateEdgeBleed(
  frame: RgbaImage,
  options?: { minAlpha?: number; marginPx?: number },
): Verdict<EdgeBleed | null>;
