/**
 * Criterion 9.5's **third load** — the screen shake — driven into the measured window, and counted.
 *
 * ## Why this file exists
 *
 * 9.5 reads *"frame budget holds under worst case: max enemies + max particles **+ shake**"*
 * (`docs/prd/phase-09-polish.md:47`). The measurement carried two of those three. `installStorm`
 * holds the player invulnerable on every frame of every arm — it has to, and the reason is in its
 * own docstring — so no hit lands, no `playerHurt` fires, and **no screen shake ever occurred in any
 * sampled window**. The spec disclosed the narrowing in its own header, but a criterion's own
 * sentence naming a load the gate does not carry is not a disclosure problem, it is an unmet
 * criterion. The gate-round `performance-engineer` brief made it finding **M2** and failed 9.5 on it.
 *
 * ## 🔴 The shake is armed through the SHIPPED path, and it is the one path with no particles in it
 *
 * `gameEffects.attachEffects` arms a shake from exactly four places: a landed blow (`light`,
 * `lethal`), a blow taken (`playerHurt`), and a **touchdown** (`land`). The first three each emit a
 * burst in the same breath — `impactSparks`, `deathSteam`, `hurtVent` — and a burst is precisely
 * what must not enter this measurement: `atLimit()` **drops** rather than evicts, so a combat burst
 * is accepted in a cheap arm and refused in an expensive one, and the sweep ends up measuring which
 * arm the game was allowed to interrupt. That inversion is the whole reason the player is held
 * invulnerable, and re-introducing it through the back door would trade a missing load for a broken
 * statistic.
 *
 * The landing branch is the exception, and `gameEffects.ts` says so at the line itself:
 *
 * > *"🔴 Armed on EVERY touchdown, not only the ones the dust threshold accepts."*
 *
 * `landingDust` returns `null` below `DUST_MIN_FALL_PX` (9 px/tick, `src/render/effects.ts:199`), so
 * a touchdown slow enough to be under it arms `land` and **emits nothing at all**. That is the seam
 * this file drives: a hop small enough that the fall never reaches the dust threshold.
 *
 * ## The hop, and why it is one tick
 *
 * `SHAKE_HOP_VY = -1` px/tick, written to `player.vy` on every animation frame the player is
 * grounded. Against `gravity` 0.675 (`src/sim/playerTuning.ts:251`) the arithmetic is fixed and
 * checkable rather than tuned:
 *
 * | tick | `vy` after step 6 | `y` relative to the floor | `grounded` after step 9 |
 * |---|---|---|---|
 * | A | `-1 + 0.675 = -0.325` | `-0.325` (clear of the solid) | **false** — airborne |
 * | B | `-0.325 + 0.675 = +0.35` | `+0.025` (overlapping again) | **true** — touchdown, `arm('land')` |
 *
 * So the player lands **every second tick**, and the fall that arms it is `0.325` px/tick — 28x
 * under the dust threshold, which is what keeps a particle out of it. `SHAKE.land.durationTicks` is
 * 3, and `shouldPreempt` re-arms on every touchdown (`shakePeak(land) >= shakeEnergy` of a shake
 * two-thirds spent), so the shake **never settles**: every frame of every window carries one.
 *
 * ## What it costs, and why `land`'s small amplitude does not weaken the claim
 *
 * `applyShake` runs unconditionally on every frame either way; what a running shake adds is two
 * trigonometric evaluations and a **non-zero** `camera.setPosition`. The second is the part that
 * matters and it is amplitude-independent: Phaser's `BaseCamera.updateSystem` sets `_customViewport`
 * from `this._x !== 0 || this._y !== 0`, and a custom viewport puts the camera on the renderer's
 * scissored path for the whole frame. `land`'s `ax` 0.0008 x 1920 is +/-1.5 px — small on screen,
 * and exactly as non-zero as `playerHurt`'s 7.6 px. The **cost** of a shake is carried by the branch,
 * not by the amplitude.
 *
 * ## It runs in EVERY arm, deliberately
 *
 * The same argument as `installStorm`'s top-up loop: whatever it costs divides out of the paired
 * delta, so it cannot manufacture a difference between the arms. It is inside `onWork`, which is the
 * term `MAX_EFFECT_FRAME_WORK_MS` asserts — and that absolute bound is criterion 9.5's own sentence.
 * So the shake is where the criterion needs it and nowhere it could distort a comparison.
 *
 * ## The counter, and why it is not `shakeSettled`
 *
 * `shakenFrames` counts frames on which the camera was **actually off its base** — `base()` is
 * published by `EffectAttachment` for exactly this class of question, and its docstring records the
 * false green that came of taking `[cam.x, cam.y]` at install time as the zero. A count of ticks on
 * which a `ShakeState` existed would prove bookkeeping; this proves the camera moved, which is the
 * same distinction `ParticleCounts.drawn` draws against `getAliveParticleCount()` one file over.
 */

import { SHAKE } from '../../src/render/screenShake';

type Page = import('@playwright/test').Page;

/**
 * The upward impulse, in px per tick, written to a grounded player once per animation frame.
 *
 * -1 and not less: the hop must clear the solid (step 9 grounds on overlap, so `|vy - gravity|` has
 * to exceed 0), and must land under `DUST_MIN_FALL_PX` so the touchdown emits no dust. -1 gives
 * -0.325 up and +0.35 down. Both conditions hold with two orders of magnitude to spare on the
 * second, and the N=0 control's `drawn === 0` assertion in the spec is what would catch it if a
 * future edit broke the first.
 */
export const SHAKE_HOP_VY = -1;

/**
 * The floor on the fraction of a sampled window's frames that carried a shake.
 *
 * 🔴 **Derived from the statistic, not fitted to a run.** The bound this guard stands in front of is
 * `MAX_EFFECT_FRAME_WORK_MS`, asserted on `workMedianMs` — a **median**. For the median frame to be
 * a frame carrying a shake, more than half the window's frames must carry one. Anything less and the
 * criterion's third load is present in the sample but absent from the number taken off it.
 *
 * 🔴 **It was 0.5, and 0.5 is the boundary value of the nearest retune rather than a margin.**
 * Working `shakeEnergy`/`shakeSettled` through the fixture: `gravity >= 1` kills the touchdown edge
 * and reads 0 % (loud red, safe); `DUST_MIN_FALL_PX < 0.35` makes the OFF arm emit dust and reds on
 * `drawn` (safe); `land.durationTicks: 3 -> 2` still reads 100 % (safe). But
 * **`land.durationTicks: 3 -> 1`** lets the shake settle on every odd tick and predicts **exactly
 * 50 %** — which `toBeGreaterThanOrEqual(0.5)` passes, on a coin flip, while half the window's
 * frames carry no shake and `MAX_EFFECT_FRAME_WORK_MS` is asserted on a MEDIAN. The guard's own
 * message would have been describing the window it just accepted.
 *
 * So it is derived with a margin over the fixture's prediction instead of placed on the nearest
 * failure: the mechanism above predicts **1.0** — 175 measured windows read 100.0 % — and 0.9 leaves
 * a tenth of a window for frame/tick misalignment while failing that retune by 40 points. It is a
 * floor on the HARNESS, exactly as `Guard 0`'s `drawn > 0` is: it fails when the window did not
 * contain the thing the bound claims to cover.
 */
export const MIN_SHAKEN_FRAME_FRACTION = 0.9;

/** A snapshot of the drive's two monotone counters. Differences of these describe one window. */
export interface ShakeCounters {
  frames: number;
  shakenFrames: number;
}

/**
 * Install the shake drive: one `requestAnimationFrame` that hops the player and counts the frames on
 * which the camera was off its base. Call once per page, after `installStorm`.
 *
 * @param hopping `false` is the red proof — see `NAMED_MUTATIONS`' `noshake`. The loop still runs and
 * still counts, so the *only* thing that changes is whether a shake is armed, and the guard that
 * exists to see that reads zero.
 */
export async function installShakeDrive(page: Page, hopping: boolean): Promise<void> {
  await page.evaluate(
    ({ hop }: { hop: number }) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        effects: { base(): { x: number; y: number } };
        simWorld: { player: { grounded: boolean; vy: number } };
        cameras: { main: { x: number; y: number } };
      };
      const w = window as unknown as {
        __fxShake?: { frames: number; shakenFrames: number; hop: number; raf: number };
      };
      if (w.__fxShake !== undefined) {
        w.__fxShake.hop = hop;
        return;
      }
      // The camera's UNSHAKEN position, from the attachment that captured it in `create()` — never
      // `[cam.x, cam.y]` read here, which is `base + whatever this frame's offset happens to be`.
      const base = scene.effects.base();
      const handle = { frames: 0, shakenFrames: 0, hop, raf: 0 };
      w.__fxShake = handle;
      const step = (): void => {
        const cam = scene.cameras.main;
        handle.frames += 1;
        if (cam.x !== base.x || cam.y !== base.y) {
          handle.shakenFrames += 1;
        }
        if (handle.hop !== 0) {
          const player = scene.simWorld.player;
          // Only while grounded: writing it in the air would fight gravity into a hover, and the
          // touchdown is the whole point. `resolveCollisions` zeroes `vy` on landing, so this is the
          // only writer of a negative `vy` in the window.
          if (player.grounded) {
            player.vy = handle.hop;
          }
        }
        handle.raf = requestAnimationFrame(step);
      };
      handle.raf = requestAnimationFrame(step);
    },
    { hop: hopping ? SHAKE_HOP_VY : 0 },
  );
}

/** Read the drive's counters. Monotone since install — a window is the difference of two reads. */
export async function readShakeCounters(page: Page): Promise<ShakeCounters> {
  return page.evaluate(() => {
    const w = window as unknown as { __fxShake?: { frames: number; shakenFrames: number } };
    if (w.__fxShake === undefined) {
      throw new Error('readShakeCounters before installShakeDrive — the shake drive is not running');
    }
    return { frames: w.__fxShake.frames, shakenFrames: w.__fxShake.shakenFrames };
  });
}

/**
 * The fraction of the frames between two snapshots that carried a shake.
 *
 * Returns 0 for an empty window rather than `NaN`: a window that served no frames has not shown that
 * it carried a shake, and `NaN` compares false against every bound in both directions, which is how
 * a guard silently stops guarding.
 */
export function shakenFraction(before: ShakeCounters, after: ShakeCounters): number {
  const frames = after.frames - before.frames;
  return frames <= 0 ? 0 : (after.shakenFrames - before.shakenFrames) / frames;
}

/** The command the drive arms, for the spec's report line. `land` is the one burst-free shake. */
export const DRIVEN_SHAKE = SHAKE.land;
