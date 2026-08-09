/** Typed view of `anchorGate.mjs` — guard G1. See `png.d.mts` for why these are hand-written. */

import type { Verdict } from './gates.d.mts';

/** What the gate measured. Both units, on purpose: px is what you see, the fraction is the rule. */
export interface ContactGeometry {
  /** Height of the keyed figure's bounding box, in source pixels. */
  figureHeight: number;
  /** How many ground-contact components were large enough to count. */
  limbs: number;
  /** Lowest opaque row of each contact limb, ascending, in source pixels. */
  soles: number[];
  spreadPx: number;
  spreadFraction: number;
  /** `round(figureHeight * MAX_SOLE_SPREAD)` — the limit this figure was judged against. */
  limitPx: number;
}

export declare const GROUND_BAND: number;
export declare const MAX_SOLE_SPREAD: number;

export declare function gateContactGeometry(
  buffer: Uint8Array,
  options?: { minAlpha?: number; maxSpread?: number },
): Verdict<ContactGeometry | null>;
