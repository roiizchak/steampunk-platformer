/**
 * Per-sprite impact feedback — the DECISION, engine-free *(vault 2.12)*.
 *
 * The half of Phase 9's effects that happens to the CHARACTER rather than to the particle system:
 * the flinch, the hit flash, the landing squash and the i-frame flicker. Split out of `effects.ts`
 * for the 400-line rule, and re-exported from it so the scene layer still has one import — the
 * boundary is real, though: everything here is a transform applied to an existing Game Object, and
 * nothing here creates or budgets one.
 *
 * Every function is recomputed from `(counter, tick)` every frame — the same no-teardown shape as
 * `goalEntryAlpha` in `playerView.ts`. Nothing has to be cancelled on a scene restart, on a death
 * mid-flinch or on a level change, because there is nothing running to cancel. A saturated or
 * never-happened state returns its neutral value, forever, without a listener remembering to put it
 * back. Phase 6 paid for the opposite shape with the HUD's lifetime.
 *
 * **No milliseconds cross this file.** Durations are ticks, distances are pixels.
 */

import { HITSTOP_TICKS, type Freezable, type ImpactClass } from '../sim/hitstop';

/**
 * The texture frame the attack clip makes contact on. **A MEASUREMENT, not a preference.**
 *
 * Traced live on **2026-08-20** against the shipped `brass-courier` sheet — see
 * `docs/qa/phase-09-polish.md`, Task 0. Contact is texture frame **4**, which is `frames[4]` because
 * Phaser's `anims` index is `textureFrame + 1`.
 *
 * ⚠️ **The clip is 10 texture frames over the 20-tick swing, not 12.** `public/assets/index.json`
 * ships `brass-courier-attack` with `frameCount: 10, simTicks: 20, fps: 30`, and 20 ticks at 60 Hz
 * is 333 ms, which is 10 frames at 30 fps. The QA log's prose says "12 frames" one line under its
 * own trace table, and that table lists texture frames 0–9 and anims indices 1–10 — ten of each. The
 * catalog is the authority and the prose is not *(CLAUDE.md)*; the unit test reads `frameCount` back
 * out of the shipped catalog rather than hard-coding either number, so a regenerated sheet turns the
 * assertion red instead of silently invalidating this comment.
 *
 * ## Why this constant has to exist at all
 *
 * Contact lands on `combatCounter` **8–9** — the **last two** ticks of the four-tick active window
 * `[6, 10)`. A hit-stop freeze that simply holds "whatever frame happened to be drawn" therefore
 * holds a **mid-wind-up pose**: the freeze is armed at step 9b, and the animation the renderer last
 * advanced is not the one the blow landed on. The whole point of the freeze is to hold the frame of
 * contact, so the frame of contact has to be named.
 *
 * ⚠️ **`tools/gen/sheetGates.mjs`'s G5 passes on this sheet and cannot see the problem**, because G5
 * only asks whether contact falls *inside* the active window. It does. Landing on the window's last
 * two ticks is inside it and is still the wrong frame to freeze.
 */
export const ATTACK_CONTACT_FRAME_INDEX = 4;
/**
 * Ticks since this body was last hit, or `null` if never. Reads `Freezable`, writes nothing.
 *
 * `-1` is the never-hit sentinel `freezePair` has never written over, and it is checked on
 * `hitstopUntil` because that is the field `hitstop.ts` documents as carrying it. `null` rather than
 * a large number is the point: every consumer below branches on it to return its neutral value, so
 * "was never hit" and "was hit and has fully recovered" reach the same place by two different routes
 * and neither can draw anything.
 */
export function ticksSinceHit(body: Readonly<Freezable>, tickCount: number): number | null {
  if (body.hitstopUntil < 0) {
    return null;
  }
  return tickCount - body.lastHitTick;
}

/** How far a flinch throws the body, per impact class. Pixels, along `facing`. */
const FLINCH_STEP_PX: Readonly<Record<ImpactClass, number>> = {
  light: 6,
  lethal: 10,
  playerHurt: 8,
};

/** Ticks of return travel after the freeze releases. */
const FLINCH_RETURN_TICKS = 6;

/** The flinch's vertical component, as a fraction of the horizontal step. A lift, not a hop. */
const FLINCH_LIFT = 0.25;

const NO_OFFSET = { dx: 0, dy: 0 };

/**
 * Enemy flinch: a **STEP** during the freeze, an eased return with a small overshoot, then settle.
 *
 * A step rather than a slide, because the body is *frozen*: `frozen()` is holding its simulation
 * still for the whole window, and easing a render offset across ticks in which nothing else moves
 * reads as lag rather than as impact. The displacement appears on the hit tick, holds, and releases.
 *
 * The return is `(1 - u)·cos(πu)` over `FLINCH_RETURN_TICKS`. The cosine crosses zero at the halfway
 * point and goes negative after it, which is the overshoot — the body swings a little past its rest
 * position and comes back. The continuous minimum is −17.9 % at u ≈ 0.73, but the function is only
 * ever evaluated at integer ticks, so the largest overshoot actually **drawn** is at `u = 4/6`:
 * `(1/3)·cos(2π/3)` = **−16.7 %** of the step. That sampled figure is the one a playtest measures. The `(1 - u)` envelope is what makes it
 * *land*: at `u = 1` the term is exactly 0, and the branch below returns the shared neutral object
 * from that tick onward rather than a computed `-0`.
 *
 * **That exactness is the property this function is tested on.** A flinch that settles at 1e-17
 * leaves the sprite permanently, invisibly displaced from the box the sim resolved its collisions
 * against, and nothing downstream can tell that apart from correct.
 */
export function flinchOffset(
  ticksSince: number | null,
  impact: ImpactClass,
  facing: 1 | -1,
): { dx: number; dy: number } {
  if (ticksSince === null || ticksSince < 0) {
    return NO_OFFSET;
  }
  const freeze = HITSTOP_TICKS[impact];
  const step = FLINCH_STEP_PX[impact];
  if (ticksSince <= freeze) {
    return { dx: step * facing, dy: -step * FLINCH_LIFT };
  }
  const u = (ticksSince - freeze) / FLINCH_RETURN_TICKS;
  if (u >= 1) {
    return NO_OFFSET;
  }
  const k = (1 - u) * Math.cos(Math.PI * u);
  return { dx: step * facing * k, dy: -step * FLINCH_LIFT * k };
}

/**
 * Hit flash. `light` DECAYS to 0; `lethal` and `playerHurt` HOLD — a dying thing stays blown out.
 *
 * The asymmetry is the whole point. A graze should read as a tap: bright, then gone, so the next one
 * a second later still registers. A kill should read as terminal: full white for every frame of the
 * freeze, released all at once on the frame the world starts moving again — the same frame
 * `shakeStartTick` puts the camera shake on. A decay there would make the biggest hit in the fight
 * fade out apologetically.
 *
 * Both reach exactly 0 at `HITSTOP_TICKS[impact]` and stay there, so the transform is self-correcting
 * for as long as the body exists.
 */
export function hitFlashAlpha(ticksSince: number | null, impact: ImpactClass): number {
  if (ticksSince === null || ticksSince < 0) {
    return 0;
  }
  const freeze = HITSTOP_TICKS[impact];
  if (ticksSince >= freeze) {
    return 0;
  }
  return impact === 'light' ? 1 - ticksSince / freeze : 1;
}

/** Ticks the landing squash runs for. 2 reads as a glitch at 60 Hz; 4 reads as a wobble. */
const LAND_SQUASH_TICKS = 3;

/** Peak horizontal stretch. The vertical is its reciprocal, which is what preserves the area. */
const LAND_SQUASH_SX = 1.18;

const NO_SQUASH = { sx: 1, sy: 1 };

/**
 * Landing squash. 3 ticks, roughly area-preserving.
 *
 * `sy` is `1 / sx` rather than `2 - sx`, so the product is 1 by construction at every tick instead of
 * only at the endpoints — the character keeps its apparent mass through the whole squash. With
 * `originY: 1` (the feet, per `playerView.ts`) the widening happens around the contact point, which
 * is where a landing looks like it should come from.
 *
 * At `LAND_SQUASH_TICKS` and beyond it returns the shared neutral object, exactly `{1, 1}`. The sim
 * freezes at step 0 once a level completes, so this is called forever afterwards with the counter's
 * final value; holding at neutral is structural rather than something a listener remembers to do.
 */
export function landSquash(ticksSinceLanded: number | null): { sx: number; sy: number } {
  if (ticksSinceLanded === null || ticksSinceLanded < 0 || ticksSinceLanded >= LAND_SQUASH_TICKS) {
    return NO_SQUASH;
  }
  const remaining = (LAND_SQUASH_TICKS - ticksSinceLanded) / LAND_SQUASH_TICKS;
  const sx = 1 + (LAND_SQUASH_SX - 1) * remaining;
  return { sx, sy: 1 / sx };
}

/** Flicker period, and the on-half of it. 3 on, 3 off. */
const IFRAME_FLICKER_PERIOD = 6;
const IFRAME_FLICKER_ON = 3;

/** The dim half's alpha. Never 0 — see the docstring. */
const IFRAME_FLOOR_ALPHA = 0.35;

/**
 * I-frame flicker. Alternates on a 6-tick period (3 on, 3 off).
 *
 * 2/2 strobes on a 288 px sprite and 5/5 reads as a broken sprite rather than as invulnerability;
 * 3/3 is the window that reads as a state.
 *
 * 🔴 **The floor is 0.35 and NEVER 0.** `IFRAME_TICKS` is 45 — three quarters of a second — and half
 * of that spent at alpha 0 is a player who cannot see where they are while something is still hitting
 * them. Alpha 0 is also exactly how the vault's blocker shipped invisible menu cards with a fully
 * green suite: nothing throws, nothing logs, and the object is present in every assertion about the
 * scene graph. `effects.test.ts` asserts the floor across all 45 ticks with its own message.
 *
 * The window test is `counter < iframeTicks`, the same `windowOpen` predicate the sim uses — a knob
 * of 0 accepts nothing, which is the branch a `<=` typo makes unreachable *(vault 5.5)*. It is
 * restated here rather than imported because importing `windows.ts` would drag its integer assertions
 * into a render path that is called every frame.
 */
export function iframeAlpha(iFrameCounter: number, iframeTicks: number): number {
  if (iFrameCounter < 0 || iFrameCounter >= iframeTicks) {
    return 1;
  }
  return iFrameCounter % IFRAME_FLICKER_PERIOD < IFRAME_FLICKER_ON ? 1 : IFRAME_FLOOR_ALPHA;
}
