/**
 * Render interpolation — drawing between two simulation ticks.
 *
 * ## The defect this removes
 *
 * `src/sim/` advances in whole 60 Hz ticks and `src/game/frameClock.ts` drains them from real
 * elapsed time. That makes the simulation frame-rate independent, which is the whole point of vault
 * 2.1 — but it says nothing about what is DRAWN between ticks. On a display faster than 60 Hz,
 * `drainTicks` returns `ticks: 0` on most frames and the scene re-draws an identical world. At
 * 240 Hz that is three still frames out of four, then a jump of `runMax` — 12 world px.
 *
 * The eye tracks a running character continuously. Holding its image still for 16.7 ms slides it
 * across the retina, which reads as a smear, and the jump lands a second copy 12 px away. The user
 * reported exactly that: "two overlapping copies" and "blurry / smeared while moving".
 *
 * The fix is the standard companion to a fixed timestep: draw each subject between where it was at
 * the previous tick and where it is now, blended by the leftover accumulator that `drainTicks`
 * already returns and that nothing was reading.
 *
 * ## Why this file is engine-free and lives in `src/render/`
 *
 * Same reason as `playerView.ts` and `cameraRig.ts` *(vault 2.12)*: a decision buried in a scene
 * method has edge cases no unit test can reach. The endpoint-exactness and teleport rules below are
 * exactly such edge cases.
 *
 * ## What this is NOT
 *
 * It does not touch `src/sim/`. The tick order in `src/sim/tick.ts` is unchanged, and so are
 * Phase 5's combat windows. It also must not reach `window.__game`, which stays SIM truth — the
 * debug surface exists to cross the keyboard→simulation seam, and mixing an interpolated `x` in
 * beside a sim `vx` would make it a snapshot of two different moments.
 *
 * ⚠️ **It costs up to one tick of visual latency.** At `alpha` 0 the drawing is a full tick behind
 * the sim. That is the accepted trade of interpolation (as opposed to extrapolation, which guesses
 * forward and then has to correct itself visibly when the guess is wrong). 16.7 ms is well inside
 * the input latency the game already has, and unlike a wrong extrapolation it never has to snap
 * back.
 */

import { MS_PER_TICK } from '../game/constants';

/** A drawn subject's position. Structural on purpose, so this module needs no sim types. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Distance beyond which a change of position is treated as a TELEPORT and drawn without blending.
 *
 * Respawn, level restart and the dev fleet spawn all move a subject instantly. Interpolating across
 * one of those would slide the sprite through the level over a single tick — a visible artifact
 * worse than the one this module removes.
 *
 * 48 px is four ticks of `runMax` (12 px/tick). Nothing the sim can do in ONE tick comes close:
 * horizontal travel is capped at `runMax`, and vertical travel is capped by terminal velocity,
 * which is smaller. The margin is deliberate — a cap set near the real per-tick maximum would start
 * snapping during ordinary fast movement, which would put the defect straight back, and
 * `interpolate.test.ts` pins that it does not.
 */
export const MAX_LEAP_PX = 48;

/**
 * Where between the previous and current tick this frame falls, as a fraction in `[0, 1]`.
 *
 * `remainderMs` is `drainTicks`'s carried remainder — the real time that has elapsed since the last
 * whole tick was simulated.
 *
 * Clamped rather than extrapolated. A value at or past a whole tick means `drainTicks` should have
 * drained it; drawing past `cur` would place the sprite somewhere the sim has never resolved a
 * collision for, which is the mistake vault 2.11 names — the drawing must not leave the box the
 * simulation resolved. Non-finite input yields 0 for the same reason `drainTicks` guards it
 * (`frameClock.ts:44`): Phaser hands out NaN deltas after a tab restore, and a NaN position makes
 * the sprite disappear rather than fail loudly.
 */
export function renderAlpha(remainderMs: number): number {
  if (!Number.isFinite(remainderMs)) {
    return remainderMs === Number.POSITIVE_INFINITY ? 1 : 0;
  }
  if (remainderMs <= 0) return 0;
  if (remainderMs >= MS_PER_TICK) return 1;
  return remainderMs / MS_PER_TICK;
}

/**
 * The point to draw at, between `prev` and `cur`.
 *
 * `prev` is `null` on the first frame and whenever no snapshot has been taken; the honest answer
 * there is `cur`, not a guess.
 *
 * The endpoints are returned EXACTLY rather than computed, because `a + (b - a) * 1` is not
 * guaranteed to equal `b` in floating point. A sprite that lands a fraction of a pixel off its true
 * position once per tick jitters — a smaller version of the defect this module exists to remove.
 */
export function interpolatedPosition(prev: Point | null, cur: Point, alpha: number): Point {
  if (prev === null) return cur;
  if (alpha >= 1) return cur;
  if (alpha <= 0) return prev;

  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  // A teleport, not motion. Snap, and do it on either axis independently of the other so a
  // horizontal respawn is caught even when y is unchanged.
  if (Math.abs(dx) > MAX_LEAP_PX || Math.abs(dy) > MAX_LEAP_PX) return cur;

  return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
}
