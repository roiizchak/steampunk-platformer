/** Typed view of `driftGate.mjs` — guard G4. See `png.d.mts` for why these are hand-written. */

import type { GateStatus } from './gates.d.mts';
import type { RgbaImage } from './png.d.mts';

export interface VerticalDrift {
  verdict: GateStatus;
  /** One entry per input frame, in order. `null` where a frame keyed out to nothing. */
  perFrameBaseline: (number | null)[];
  /** `max(baseline) - min(baseline)` across every frame with a measured baseline. */
  drift: number | null;
  /** The deepest (largest-y) baseline reached anywhere in the animation. */
  verticalAnchor: number | null;
  /** Present only when `verdict` is `'FAIL'`. */
  offendingFrame?: number;
  reason: string;
}

export declare const DEFAULT_MAX_DRIFT_PX: number;

export declare function gateVerticalDrift(
  frames: RgbaImage[],
  opts?: {
    minAlpha?: number;
    maxDriftPx?: number;
    allowancePx?: number;
    key?: readonly [number, number, number];
    low?: number;
    high?: number;
  },
): VerticalDrift;
