/**
 * **G4 — vertical drift / per-frame baseline.** The gate `docs/HANDOFF.md` said to "run" before it
 * existed.
 *
 * ## The defect this replaces
 *
 * Phase 4 shipped an anchor with one boot 58 source pixels above the other (guard G1,
 * `anchorGate.mjs`, criterion 4.27) — a single-frame version of this exact family of bug. The
 * animated version is worse and harder to catch by eye: if the subject's FLOOR LINE drifts across
 * the frames of one packed animation, the character climbs or sinks against the ground at runtime,
 * one packed cell at a time, and no single frame looks wrong in isolation.
 *
 * ## What is measured
 *
 * For each frame, the **baseline**: the bottom-most row carrying subject pixels, after keying the
 * frame with the SAME `keyOut` the pipeline uses — not a second copy of the tolerance ramp (vault
 * 5.3). Reusing it is what makes this gate see the figure the packer actually sees, the same
 * reasoning `anchorGate.mjs`'s header gives for G1.
 *
 * `drift` is the peak-to-peak spread of the baseline series — `max(baseline) - min(baseline)` across
 * every frame, not merely the first and the last. A spike in one interior frame that returns to the
 * same floor by the final frame is invisible to a first/last comparison and would still bob on
 * screen; a full per-frame scan is the only thing that sees it.
 *
 * ## Airborne is not a defect (vault: named in the work item, not inferred)
 *
 * `jump` and `fall` are SUPPOSED to leave the ground. `motion.mjs`'s `VIDEO_MOTIONS` entries already
 * carry a data-driven `airborne: true` flag for exactly this kind of decision, so the caller passes
 * an explicit `allowancePx` — never a name string and never a hardcoded action list — and that
 * allowance is added to the small per-pixel budget every animation gets for ordinary wobble. A
 * legitimately airborne action is not exempted from measurement, only given more room.
 *
 * ## INDETERMINATE is a real verdict (vault 4.18)
 *
 * A frame that keys out to nothing carries a `null` baseline and is excluded from the drift
 * calculation rather than treated as height 0, which would read as an enormous, false drift. If
 * EVERY frame keys out to nothing there is nothing to measure at all.
 */

import { CHROMA, keyOut } from './chroma.mjs';
import { FAIL, INDETERMINATE, PASS } from './gates.mjs';

/** Ordinary frame-to-frame wobble every animation is allowed, with no `allowancePx` at all. */
export const DEFAULT_MAX_DRIFT_PX = 3;

/** Lowest row (largest y) whose alpha reaches this before it counts as "subject". */
const DEFAULT_MIN_ALPHA = 128;

/** Bottom-most opaque row of a keyed frame, or `null` if nothing survived the key. */
function baselineOf(image, minAlpha) {
  const { width, height, data } = image;
  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x * 4 + 3] >= minAlpha) {
        return y;
      }
    }
  }
  return null;
}

/**
 * Measure vertical drift across one packed animation's frames.
 *
 * `frames` are raw decoded RGBA frames (chroma background still present — this keys each one
 * itself, exactly like `anchorGate.mjs` keys its single anchor).
 *
 * `opts.allowancePx` is the explicit, caller-supplied airborne allowance (vault: an input, never a
 * name or a hardcoded list). `opts.maxDriftPx` overrides the default ordinary-wobble budget.
 */
export function gateVerticalDrift(frames, opts = {}) {
  const minAlpha = opts.minAlpha ?? DEFAULT_MIN_ALPHA;
  const maxDriftPx = opts.maxDriftPx ?? DEFAULT_MAX_DRIFT_PX;
  const allowancePx = opts.allowancePx ?? 0;
  const key = opts.key ?? CHROMA.KEY;
  const low = opts.low ?? CHROMA.LOW;
  const high = opts.high ?? CHROMA.HIGH;

  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      verdict: INDETERMINATE,
      perFrameBaseline: [],
      drift: null,
      verticalAnchor: null,
      reason: 'no frames supplied — nothing to measure',
    };
  }

  const perFrameBaseline = frames.map((frame) =>
    baselineOf(keyOut(frame, { key, low, high }), minAlpha),
  );
  const known = perFrameBaseline
    .map((baseline, index) => ({ baseline, index }))
    .filter((entry) => entry.baseline !== null);

  if (known.length === 0) {
    return {
      verdict: INDETERMINATE,
      perFrameBaseline,
      drift: null,
      verticalAnchor: null,
      reason: 'every frame keyed out to nothing — no subject pixel found in any frame',
    };
  }

  const values = known.map((entry) => entry.baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const drift = max - min;
  // The deepest (largest-y) row reached anywhere in the animation — the same "furthest-down" row
  // convention `build-assets.mjs`'s per-sheet baseline already anchors on (see `sheets.mjs`'s
  // header: "the deepest frame reaches the cell's last row").
  const verticalAnchor = max;
  const budget = maxDriftPx + allowancePx;

  if (drift <= budget) {
    return {
      verdict: PASS,
      perFrameBaseline,
      drift,
      verticalAnchor,
      reason: `drift ${drift}px within budget ${budget}px (${maxDriftPx}px + ${allowancePx}px allowance)`,
    };
  }

  // Name the offending frame: whichever extreme (the deepest or the shallowest baseline) sits
  // farther from the FIRST known frame, which is the floor the animation opened on.
  const reference = perFrameBaseline[known[0].index];
  const deepest = known.find((entry) => entry.baseline === max);
  const shallowest = known.find((entry) => entry.baseline === min);
  const offendingFrame =
    max - reference >= reference - min ? deepest.index : shallowest.index;

  return {
    verdict: FAIL,
    perFrameBaseline,
    drift,
    verticalAnchor,
    offendingFrame,
    reason:
      `frame ${offendingFrame} drifts the animation ${drift}px vertically (budget ${budget}px = ` +
      `${maxDriftPx}px + ${allowancePx}px allowance) — baseline ${perFrameBaseline[offendingFrame]}px ` +
      `against an opening floor of ${reference}px`,
  };
}
