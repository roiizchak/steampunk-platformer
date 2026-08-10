/**
 * **G5 — does the contact frame land inside the active window?** Criterion 5.4c.
 *
 * ## The defect this replaces
 *
 * Vault **4.22**: every light attack shipped with 0.43 s of art over a 0.25 s move, so the strike
 * was never drawn during the tick the hitbox was actually live — damage landed while the art still
 * showed wind-up. `gateReachBand` in `gates.mjs` cannot catch this: it returns ONE best candidate
 * against a whole-frame noise floor, with no per-frame profile, no component isolation, no
 * left-facing handling and no tick alignment at all. This module is the real thing, not a wrapper
 * around it (`frameDifference`-style per-pixel comparison is reused; the verdict logic is not).
 *
 * ## The four things this does that `gateReachBand` does not
 *
 *  1. **A per-frame reach PROFILE**, not one winner — `profile` below has one entry per frame.
 *  2. **Component isolation.** Each frame's changed pixels are grouped into connected components
 *     (the same 4-connected labeller `anchorGate.mjs` uses); the LARGEST component clearing
 *     `CHROMA.MIN_COMPONENT_PX` is treated as the reaching limb. Mass, not position, decides —
 *     a small unrelated blob (a cape corner, a steam wisp, a swinging counterweight) sitting further
 *     forward than the actual limb cannot out-vote the bigger component it belongs to.
 *  3. **Facing is an input.** `opts.facing` is `'left'` or `'right'`; a left-facing subject's reach
 *     is measured toward decreasing x, mirrored so "more reach" is always a larger number regardless
 *     of facing.
 *  4. **Frame index -> the tick it is actually drawn on.** `PLAY_LAG_TICKS` below is a NAMED
 *     constant, not a bare `1` inside the arithmetic, because `tools/gen/*.mjs` runs under plain
 *     Node and cannot `import` `src/sim/combat.ts` (no TS toolchain in this half of the pipeline).
 *     `tests/unit/reach-gate.test.ts` imports the REAL `PLAY_LAG_TICKS` from `combat.ts` and pins it
 *     equal to the constant here, so the two cannot silently drift — the closest a cross-language
 *     boundary can get to "import the predicate, never restate it" (vault 5.3).
 *
 * ## INDETERMINATE is a real verdict (vault 4.18) — and it is NOT a pass
 *
 * A clip with no discernible reach anywhere (nothing ever clears the component floor) cannot be
 * judged on this axis at all, so it reports `INDETERMINATE`, never a guessed `PASS` or `FAIL`.
 * **`INDETERMINATE` does not satisfy criterion 5.4c.** A run that treats it as a pass to keep a
 * report green is the exact failure vault 4.18 exists to prevent — say so here so nobody reads this
 * module's output that way later.
 */

import { CHROMA, components } from './chroma.mjs';
import { FAIL, INDETERMINATE, PASS } from './gates.mjs';

/**
 * The animation clock runs one tick behind the sim — see `src/sim/combat.ts`'s own doc comment on
 * `PLAY_LAG_TICKS` for why. Mirrored here as a named constant (never a bare `1` in the tick
 * arithmetic below) and pinned equal to the real export by `tests/unit/reach-gate.test.ts`.
 */
export const PLAY_LAG_TICKS = 1;

/** Per-channel summed abs difference at or above this counts as "changed". Matches `gateReachBand`. */
export const DEFAULT_THRESHOLD = 24;

function verdict(status, extra, reason) {
  return { verdict: status, reason, ...extra };
}

/** A same-size RGBA mask: alpha 255 where `frame` differs from `base` by >= `threshold`, else 0. */
function diffMask(base, frame, threshold) {
  const { width, height } = base;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    const d =
      Math.abs(base.data[i] - frame.data[i]) +
      Math.abs(base.data[i + 1] - frame.data[i + 1]) +
      Math.abs(base.data[i + 2] - frame.data[i + 2]) +
      Math.abs(base.data[i + 3] - frame.data[i + 3]);
    if (d >= threshold) {
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * The one qualifying component's leading edge for one frame, or `null` if nothing clears the floor.
 *
 * "Largest wins" is the component-isolation rule (see header, point 2): among components clearing
 * `minComponentPx`, the biggest by pixel area is the reaching limb, independent of which one sits
 * furthest forward.
 */
function frameReach(mask, minComponentPx, facing) {
  const { labels, sizes } = components(mask, 128);
  let bestLabel = -1;
  let bestSize = 0;
  for (let l = 0; l < sizes.length; l += 1) {
    if (sizes[l] >= minComponentPx && sizes[l] > bestSize) {
      bestSize = sizes[l];
      bestLabel = l;
    }
  }
  if (bestLabel === -1) {
    return null;
  }
  let edgeX = facing === 'left' ? Infinity : -Infinity;
  for (let p = 0; p < labels.length; p += 1) {
    if (labels[p] !== bestLabel) {
      continue;
    }
    const x = p % mask.width;
    if (facing === 'left' ? x < edgeX : x > edgeX) {
      edgeX = x;
    }
  }
  const reach = facing === 'left' ? mask.width - 1 - edgeX : edgeX;
  return { edgeX, reach, componentPx: bestSize };
}

/**
 * G5. `frames[0]` is the rest pose every later frame is diffed against, exactly like `gateReachBand`.
 *
 * `opts`: `simTicks`, `startup`, `active` (all integer ticks — the move's active-window contract,
 * e.g. `ATTACK` from `combat.ts`), `facing` (`'left'` | `'right'`, default `'right'`), plus optional
 * `threshold`, `minComponentPx`, `playLagTicks` overrides for testing.
 *
 * Returns `{ verdict, profile, peakFrame, peakTick, window, reason }`. `profile` has one entry per
 * frame: `{ frame, reach, componentPx, edgeX }`, with `reach: null` where no component cleared the
 * floor that frame. Frame 0 always reports `reach: 0` — it is the base, not a candidate.
 *
 * **Plateau resolution, documented rather than left to fall out:** where several frames tie for the
 * peak reach, the FIRST is `peakFrame` — the moment contact begins, not the moment it ends.
 */
export function gateReachWindow(frames, opts = {}) {
  const facing = opts.facing ?? 'right';
  if (facing !== 'left' && facing !== 'right') {
    throw new Error(`gateReachWindow: facing must be 'left' or 'right', got ${String(facing)}`);
  }
  const { simTicks, startup, active } = opts;
  for (const [label, value] of [['simTicks', simTicks], ['startup', startup], ['active', active]]) {
    if (!Number.isInteger(value)) {
      throw new Error(`gateReachWindow: opts.${label} must be an integer tick count, got ${value}`);
    }
  }
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const minComponentPx = opts.minComponentPx ?? CHROMA.MIN_COMPONENT_PX;
  const playLagTicks = opts.playLagTicks ?? PLAY_LAG_TICKS;
  const window = { startup, active, openTick: startup, closeTick: startup + active };

  if (!Array.isArray(frames) || frames.length < 2) {
    return verdict(INDETERMINATE, { profile: [], peakFrame: null, peakTick: null, window },
      'fewer than two frames — nothing moved to measure');
  }

  const base = frames[0];
  const profile = frames.map((frame, i) => {
    if (i === 0) {
      return { frame: 0, reach: 0, componentPx: 0, edgeX: null };
    }
    const candidate = frameReach(diffMask(base, frame, threshold), minComponentPx, facing);
    return candidate
      ? { frame: i, reach: candidate.reach, componentPx: candidate.componentPx, edgeX: candidate.edgeX }
      : { frame: i, reach: null, componentPx: 0, edgeX: null };
  });

  const qualifying = profile.filter((p) => p.frame !== 0 && p.reach !== null);
  if (qualifying.length === 0) {
    return verdict(INDETERMINATE, { profile, peakFrame: null, peakTick: null, window },
      'no frame produced a component clearing the noise floor — flat profile, nothing to measure');
  }

  const peakReach = Math.max(...qualifying.map((p) => p.reach));
  const peakEntry = qualifying.find((p) => p.reach === peakReach);
  const peakFrame = peakEntry.frame;
  const peakTick = Math.round((peakFrame * simTicks) / frames.length) + playLagTicks;
  const counter = peakTick - startup;
  const inWindow = counter >= 0 && counter < active;

  if (inWindow) {
    return verdict(PASS, { profile, peakFrame, peakTick, window },
      `frame ${peakFrame} (tick ${peakTick}) lands inside the active window [${startup}, ${startup + active})`);
  }
  return verdict(FAIL, { profile, peakFrame, peakTick, window },
    `frame ${peakFrame} (tick ${peakTick}) misses the active window [${startup}, ${startup + active}) — ` +
      `contact is drawn ${counter < 0 ? 'before' : 'after'} the strike`);
}
