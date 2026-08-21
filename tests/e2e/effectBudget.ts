/**
 * The constants and the counters behind criteria 9.5 and 9.6 — what a frame of particles may cost,
 * and how many particles a frame actually SUBMITTED.
 *
 * The spec states the claims; this file is the instrument and the numbers, argued once beside the
 * code that implements them. Same seam `perfSampler.ts` draws for 5.11 and `perfBudget.ts` for the
 * fleet — and the same reason: a bound whose derivation lives in a QA log drifts from the assertion
 * that uses it.
 *
 * 🔴 **`perfSampler.ts` is NOT extended.** It sits at 398 of the 400-line limit, and the particle
 * figure below would push it over. `counts(page)` is imported UNCHANGED by the spec and called
 * alongside `particleCounts(page)`, which is the same coverage without editing a file with two
 * lines of headroom.
 */

import { EFFECT_PEAK_ALIVE, EMITTER_SPECS, type EffectKind } from '../../src/render/effects';

type Page = import('@playwright/test').Page;

/** The three kinds, in one place, so nothing below restates them. */
export const EFFECT_KINDS = Object.keys(EMITTER_SPECS) as EffectKind[];

/**
 * The shipped worst case, **bounded by construction**.
 *
 * Re-exported from `src/render/effects.ts` rather than copied. `perfBudget.ts:17` is the cautionary
 * example: its `DEV_FLEET_COUNT` comment still says the constant "mirrors a private const in
 * `GameScene.ts`" — it moved to `src/scenes/gameDev.ts:46` and the comment did not follow. An import
 * cannot drift.
 *
 * Each emitter's `maxAliveParticles` is a hard cap because Phaser's `atLimit()` **drops** an emit
 * request rather than evicting the oldest, so 32 + 48 + 16 is a ceiling and not an average.
 */
export const SHIPPED_PEAK_ALIVE = EFFECT_PEAK_ALIVE;

/**
 * The sweep. **This gate does not exist until these order.**
 *
 * A statistic that cannot order its own mutation cannot be repaired by moving a threshold — that
 * rule is why criterion 6.9's GPU ratio was thrown out rather than retuned, after it ranked five
 * full-screen scrims *below* a clean run. So the spec measures the statistic at each of these peak
 * alive-counts and asserts it rises with N **before** any bound is applied to it.
 *
 * 0 is the control arm and is part of the sweep, not separate from it: "0 particles is not cheaper
 * than 1024 particles" is exactly the failure the ordering check exists to catch.
 */
export const SWEEP_ALIVE = [0, 64, 128, 256, 512, 1024] as const;

/** The top of the sweep, and the amplification the per-particle figure is divided back out of. */
export const STORM_ALIVE = SWEEP_ALIVE[SWEEP_ALIVE.length - 1];

/**
 * Ten pairs, alternating AB/BA — `phase-07-perf.spec.ts`'s `PAIRS`, for its reasons verbatim.
 *
 * A fixed order does not cancel a first-position penalty, it **attributes it to the treatment arm**.
 * And three pairs, then six, were both too few for a median: at six the clean spread was 3.3 % wide
 * and a bound chosen from six clean runs false-redded on the seventh.
 */
export const PAIRS = 10;

/**
 * 120 ticks — two seconds of steady state per window, matching `AUDIO_SAMPLE_TICKS`.
 *
 * Shorter than combat's 180 because there is nothing periodic to catch here: the storm is topped up
 * to its cap on every frame, so every frame of the window is the same frame. What the window has to
 * buy is SAMPLES for the median, and two seconds at this harness's rate is ~480 of them.
 */
export const EFFECT_SAMPLE_TICKS = 120;

/**
 * `performance.now()`'s quantisation step in this browser, in milliseconds — the **resolution of
 * every number in this file**, and the reason several of them are shaped the way they are.
 *
 * 🔴 It is not a tolerance and it is not a fudge. `sample()`'s `workMedianMs` is
 * `performance.now() - frameStart` for one real frame, so every sample is a difference of two
 * quantised readings and every median is an exact multiple of this. A first run of the sweep read
 * `0.600 / 0.600 / 0.600 / 0.700 / 0.800 / 1.100` and **failed its own monotonicity check** on
 * `0.6000000089 >= 0.6000000119` — two identical grid steps separated by float dirt. Comparing the
 * raw doubles was reading four digits the clock does not produce.
 *
 * So the ordering check compares in units of THIS, which is strictly monotone at the instrument's
 * resolution: a genuine one-step inversion still fails, and a tie between two readings the clock
 * cannot separate does not. `phase-08-gate-perf.spec.ts:63-72` records the same grid throwing away a
 * whole statistic — *"0.600 and 0.400 are adjacent steps on the clock's own grid and that 1.500 is
 * the quantum, not the gate"*.
 *
 * ⚠️ **This is the measurement floor, stated plainly.** `SHIPPED_PEAK_ALIVE` particles cost well
 * under one step, so `N = 0`, `64` and `128` are indistinguishable here and the table says so. The
 * shipped figure is not read directly at all — it is the amplified storm, divided back, and legal
 * only while the sweep is linear.
 */
export const CLOCK_GRID_MS = 0.1;

/**
 * The absolute ceiling on main-thread work per frame, in the worst case 9.5 names.
 *
 * ## Why absolute, and why main-thread
 *
 * 9.5 is an absolute claim — *the budget holds* — and a delta cannot express one. Both ship: the
 * paired delta says what the particles cost, this says the frame stayed inside its budget while
 * paying it.
 *
 * **Main-thread, not GPU.** These particles are a CPU cost: `ParticleEmitter.preUpdate` walks every
 * alive particle every frame through up to fifteen `EmitterOp` evaluations, and
 * `ParticleEmitterWebGLRenderer` then builds one quad per particle on the main thread. The pixels
 * are three 12 px dots' worth of fill. A GPU statistic here would be measuring the wrong end of the
 * pipe, and 6.9's history is what that costs.
 *
 * ## The number
 *
 * ⚠️ **An absolute millisecond from this harness is not a millisecond on a player's machine.**
 * HANDOFF §14 measured the same scene 21x slower under SwiftShader, and even on the real GPU Vite is
 * compiling and the box is shared. What this bound is for is the day the effects path stops being
 * three pooled emitters at one depth band — it is a tripwire on the harness's own scale, and the
 * paired delta beside it is what carries the comparative claim.
 *
 * The claim: **the whole worst-case frame — `DEV_FLEET_COUNT` enemies, the level, the HUD and the
 * shipped particle ceiling — stays inside about a sixth of a 60 Hz frame on reference hardware.**
 * 16.67 / 6 is 2.78, rounded down to 2.5, and it is tighter than the fleet's own
 * `MAX_FLEET_WORK_MS = 8` that it sits underneath.
 *
 * The selection set then read 0.500 / 0.500 / 0.600 ms, so the bound is roughly 4x above the worst
 * of them. Chosen on one set of runs and confirmed on a HELD-OUT set that had no say in it; both
 * sets are in `docs/qa/phase-09-polish.md`.
 */
export const MAX_EFFECT_FRAME_WORK_MS = 2.5;

/**
 * The floor on the paired delta at the amplified peak — the **premise check**, in the shape
 * `phase-08-gate-perf.spec.ts`'s *"the amplifier is not amplifying"* guard establishes.
 *
 * Without it the per-particle figure below is a delta of noise divided by 1024, and
 * `MAX_EFFECT_FRAME_WORK_MS` would pass for a build whose particles cost anything at all — because
 * a build that drew none would pass it most comfortably of the lot.
 *
 * ⚠️ **It is a FLOOR, so it is the one bound here that can false-RED**, which is why it is set two
 * clock steps rather than close to the reading. The selection set measured 0.500 / 0.600 / 0.700 ms
 * of storm delta; 0.2 sits 2.5x under the weakest of them and is still twice the clock's own
 * resolution, so it cannot be satisfied by a single step of quantisation noise.
 */
export const MIN_STORM_WORK_DELTA_MS = 0.2;

/**
 * The ceiling on what the shipped particle peak adds to a frame, measured as the median of ten
 * per-pair deltas.
 *
 * The paired half of 9.5. It ships **beside** `MAX_EFFECT_FRAME_WORK_MS` rather than instead of it,
 * because the two answer different questions and neither substitutes: the absolute one says the
 * frame stayed inside its budget, this one says how much of the budget the new feature took.
 *
 * ⚠️ **This number sits close to the clock grid and is a CEILING, not a reading.** 96 particles do
 * not clear `performance.now()`'s 0.1 ms quantisation on their own — every measured per-pair delta
 * is 0.000 or 0.100 and nothing in between — which is exactly why `MAX_PER_PARTICLE_WORK_MS` exists
 * and is measured by amplification instead.
 *
 * 0.3 is `MAX_PER_PARTICLE_WORK_MS * SHIPPED_PEAK_ALIVE` rounded up to the next clock step, so the
 * two bounds state the same claim at the two resolutions the harness can express it in. It is
 * **three** grid steps; the selection set measured one. Chosen from what is correct rather than from
 * what passes, then confirmed on a HELD-OUT set — both are in `docs/qa/phase-09-polish.md`.
 */
export const MAX_EFFECT_WORK_DELTA_MS = 0.3;

/**
 * The ceiling on ONE shipped particle's main-thread cost, in milliseconds per frame.
 *
 * 🔴 **This is a divided-back figure and it is only legitimate because the sweep is linear.** The
 * shipped 96-particle ceiling sits *below* `performance.now()`'s 0.1 ms quantisation grid in this
 * browser, so it cannot be read directly: 0.100 and 0.200 are adjacent steps on the clock, not a
 * measurement. What is measured is the amplified storm; what is reported is that delta over the
 * particle count. If the sweep stops being linear the spec withdraws the divide-back rather than
 * reporting an extrapolation through a region it did not measure.
 *
 * ## Where 0.003 comes from, and it is not from what passes
 *
 * The claim it encodes: **at its shipped ceiling the whole effects feature may not take more than
 * about 2 % of a 60 Hz frame.** 16.67 ms times 2 % is 0.33 ms, over `SHIPPED_PEAK_ALIVE` particles
 * is 0.0035 ms each, rounded down to 0.003. That is a budget decision about a game, arrived at
 * without looking at a measurement.
 *
 * What the measurements then said: the selection set read 0.00049 / 0.00059 / 0.00068 ms per
 * particle at 1024 and 0.00039 / 0.00059 / 0.00078 at 512 — so the bound sits about 4x above the
 * worst reading in it, and the whole shipped feature costs roughly **0.06 ms**, a third of one step
 * of the clock that measured it.
 */
export const MAX_PER_PARTICLE_WORK_MS = 0.003;

/**
 * How far two per-particle estimates taken at different amplifications may sit apart.
 *
 * `phase-08-gate-perf.spec.ts:137`'s `MAX_LINEARITY_SPREAD`, for its reason verbatim: dividing a
 * delta by a count is an ASSUMPTION until two amplifications agree, and the answer to that objection
 * is to measure it rather than argue it.
 */
export const MAX_LINEARITY_SPREAD = 4;

/**
 * The floor on the drawn-particle count at the shipped peak — 9.6's load-bearing literal.
 *
 * Not `SHIPPED_PEAK_ALIVE` itself: the count is read between frames, and a particle that expired
 * since the last top-up is legitimately absent. Two-thirds of the ceiling is far above anything a
 * broken path produces (which is zero) and far below anything a working one produces (which is 96).
 */
export const MIN_DRAWN_AT_PEAK = 64;

/** What one read of the emitters returns. `drawn` is the load-bearing figure; the rest support it. */
export interface ParticleCounts {
  /**
   * Particles this frame would SUBMIT to the batch, per Phaser's own renderer.
   *
   * 🔴 **Not `getAliveParticleCount()`, and that is criterion 9.6 in one line.** An alive particle
   * proves emitter STATE, not draw submission: at `setScale(0)` it reports alive, reports
   * `visible: true`, reports `alpha: 1`, and draws nothing at all. `perfSampler.ts:212-224` closed
   * exactly this hole one layer down for enemy bodies, on Codex 5.14 blocker 1, by asking Phaser's
   * `willRender(camera)` instead of guessing at exclusion routes.
   *
   * A Phaser 4 `Particle` is **not a Game Object** and has no `willRender` — verified against
   * `node_modules/phaser/src/gameobjects/particles/Particle.js`, whose whole method list is `emit`,
   * `isAlive`, `kill`, `setPosition`, `fire`, `update`, `computeVelocity`, `setSizeToFrame`,
   * `getBounds`, `destroy`. So the predicate is transcribed from the ONE place that decides it,
   * `ParticleEmitterWebGLRenderer.js:66-85`: the **emitter** must `willRender(camera)` (which is
   * where an emitter-level `setScale(0)` is caught, exactly as it is for a body), its `viewBounds`
   * must intersect the camera, and then per particle `alpha * emitter.alpha > 0` and
   * `scaleX !== 0` and `scaleY !== 0`. Every particle that clears all of that is submitted; every
   * one that does not is `continue`d over.
   */
  drawn: number;
  /**
   * `drawn` AND inside the camera's world view — a supporting figure, deliberately not the gate.
   *
   * Phaser's particle renderer performs **no per-particle cull** (see the file above: the only
   * bounds test is the emitter's optional `viewBounds`), so an off-screen particle still costs a
   * matrix, a quad and a batch slot. Submission is therefore the honest statistic for a main-thread
   * budget. This one exists so a storm emitted somewhere the camera cannot see is visible as such in
   * the output rather than passing quietly.
   */
  inView: number;
  /** `getAliveParticleCount()` summed. **Supporting only** — this is the figure 9.6 distrusts. */
  alive: number;
  /** How many of the three emitters cleared `willRender(camera)`. 3 when the path is healthy. */
  emittersDrawing: number;
}

/**
 * Read all three shipped emitters in one page round trip.
 *
 * The emitters come off `EffectAttachment.emitters()` — the handle the scene publishes — never a
 * duplicate built by the test. A fixture that re-implements the thing it measures proves nothing
 * about the shipped code.
 */
export async function particleCounts(page: Page): Promise<ParticleCounts> {
  return page.evaluate(() => {
    interface P {
      alpha: number;
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }
    interface E {
      alive: P[];
      alpha: number;
      viewBounds: { x: number; y: number; width: number; height: number } | null;
      willRender(camera: unknown): boolean;
      getAliveParticleCount(): number;
    }
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      effects: { emitters(): Record<string, E> };
      cameras: {
        main: { worldView: { x: number; y: number; width: number; height: number } };
      };
    };
    const camera = scene.cameras.main;
    const view = camera.worldView;
    const hit = (a: { x: number; y: number; width: number; height: number }): boolean =>
      a.x < view.x + view.width &&
      a.x + a.width > view.x &&
      a.y < view.y + view.height &&
      a.y + a.height > view.y;

    let drawn = 0;
    let inView = 0;
    let alive = 0;
    let emittersDrawing = 0;
    for (const emitter of Object.values(scene.effects.emitters())) {
      alive += emitter.getAliveParticleCount();
      // The emitter-level gates, in the renderer's own order. `willRender` is where a `setScale(0)`
      // on the emitter is caught: Phaser clears the transform render flag when a scale hits zero.
      if (!emitter.willRender(camera)) {
        continue;
      }
      if (emitter.viewBounds && !hit(emitter.viewBounds)) {
        continue;
      }
      emittersDrawing += 1;
      for (const p of emitter.alive) {
        // The per-particle `continue` from ParticleEmitterWebGLRenderer.js, inverted.
        if (p.alpha * emitter.alpha <= 0 || p.scaleX === 0 || p.scaleY === 0) {
          continue;
        }
        drawn += 1;
        if (p.x >= view.x && p.x <= view.x + view.width && p.y >= view.y && p.y <= view.y + view.height) {
          inView += 1;
        }
      }
    }
    return { drawn, inView, alive, emittersDrawing };
  });
}
