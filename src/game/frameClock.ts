/**
 * The real-time -> simulated-time seam, extracted from the scene so it can be tested.
 *
 * Vault **2.12**: *"Pull render decisions out of scenes into engine-free modules. Rule: if a scene
 * rule has an edge case, that's the move — not a browser test."* This is that move. Adversarial
 * review brief 2 found the backlog-drop branch below had **no test at all** and could not have one
 * while it lived inside a `Phaser.Scene` method: no unit test can instantiate a scene, and no e2e
 * spec can reliably stall a browser hard enough to reach it. Moving eight lines out made the edge
 * case reachable from `tests/unit/frame-clock.test.ts` in milliseconds.
 *
 * This module lives in `src/game/`, not `src/sim/`, and the distinction is the point: milliseconds
 * exist HERE and stop here. Everything downstream of `drainTicks` counts in whole ticks, which is
 * what makes the simulation's behaviour independent of frame rate (vault 2.1).
 */

import { MAX_TICKS_PER_FRAME, MS_PER_TICK } from './constants';

export interface Drain {
  /** Whole ticks to run this frame. Never negative, never above `MAX_TICKS_PER_FRAME`. */
  ticks: number;
  /** Milliseconds left over, carried into the next frame. */
  remainderMs: number;
  /** Ticks discarded because the backlog exceeded the cap. Zero on every healthy frame. */
  dropped: number;
}

/**
 * Convert elapsed wall-clock into whole ticks plus a carried remainder.
 *
 * Three behaviours worth stating, because each is a bug if it goes the other way:
 *
 *  1. **The remainder is carried, not discarded.** Dropping it would lose a few milliseconds every
 *     frame, and a 144 Hz monitor would run the game measurably slower than a 60 Hz one.
 *  2. **A backlog over the cap is DROPPED, not queued.** Keeping it guarantees the next frame is
 *     later still — the spiral of death. The game runs briefly in slow motion instead of hanging,
 *     and slow motion is recoverable. `dropped` reports how much was thrown away rather than
 *     hiding it, because a silent cap reads as "we simulated everything" when we did not.
 *  3. **A non-finite or negative delta contributes nothing.** Phaser can hand out a huge or NaN
 *     delta on the first frame after a stall or a tab restore; feeding that into the accumulator
 *     poisons every later frame, and `NaN` in particular makes `ticks` NaN and the loop silently
 *     never run again.
 */
export function drainTicks(accumulatorMs: number, deltaMs: number): Drain {
  const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const pending = accumulatorMs + safeDelta;
  const whole = Math.floor(pending / MS_PER_TICK);

  if (whole > MAX_TICKS_PER_FRAME) {
    return { ticks: MAX_TICKS_PER_FRAME, remainderMs: 0, dropped: whole - MAX_TICKS_PER_FRAME };
  }
  return { ticks: whole, remainderMs: pending - whole * MS_PER_TICK, dropped: 0 };
}
