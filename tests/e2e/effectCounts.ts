/**
 * The particle COUNTER behind criterion 9.6 — how many particles a frame actually submitted.
 *
 * Split out of `effectBudget.ts` when that file crossed the 400-line rule, and the seam is a real
 * one rather than a line count: `effectBudget.ts` says what a frame **may cost** and argues every
 * literal; this file says what a frame **actually drew** and argues the predicate. It is
 * `perfSampler.counts()`'s sibling and deliberately not an extension of it — that file sits at 398
 * of 400, and the ruling on this task was to add the particle figure beside it rather than inside it.
 *
 * 🔴 The whole file exists because `getAliveParticleCount()` proves emitter STATE, not draw
 * submission. The argument is on `ParticleCounts.drawn` below, and the transcription it rests on is
 * cited line by line to the engine source rather than paraphrased.
 *
 * `sampleArm` and `spawnWorstCaseFleet` moved here from `effectMutation.ts` in the same split, and
 * they belong with the counter rather than with the mutations: both are *readings*, and every
 * assertion in them is a precondition on a reading — `polishSeries.ts`'s seam, one file further out.
 * Imports flow one way, `effectCounts → effectMutation → effectBudget`, so nothing here is circular.
 *
 * Two more preconditions on a reading moved out again in the 9.5 fix round, for the same reason and
 * with the same seam: `effectShake.ts` owns criterion 9.5's third load and the counter Guard 0c
 * asserts, and `windowStall.ts` owns the deadline that stops a stopped simulation presenting as a
 * ten-minute hang. Both are *preconditions on a reading*; neither is a count of what was drawn.
 */

import { expect } from '@playwright/test';

import { EFFECT_SAMPLE_TICKS } from './effectBudget';
import { setStorm } from './effectMutation';
import {
  MIN_SHAKEN_FRAME_FRACTION,
  readShakeCounters,
  shakenFraction,
  type ShakeCounters,
} from './effectShake';
import { DEV_FLEET_COUNT, MIN_SAMPLES } from './perfBudget';
import { counts, waitForBodyCount, type Sample } from './perfSampler';
import { boundedWindow, stallReport } from './windowStall';

type Page = import('@playwright/test').Page;

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
  /**
   * How many of the three the CAMERA actually reached last frame — Phaser's own record, not ours.
   *
   * 🔴 **`willRender` is not sufficient on its own, and the hole is one token wide.**
   * `GameObject.js:709` reads
   * `listWillRender = (this.displayList && this.displayList.active) ? … : true` — so an emitter on
   * **no** display list returns **true**. Change `createEmitter`'s `scene.add.particles(...)`
   * (`gameEffects.ts:331`) to `scene.make.particles` and the emitter leaves both the display and the
   * update lists: particles stop ageing, `getAliveParticleCount()` pins at the cap, `willRender`
   * still says yes, `drawn` still reads 96 — and nothing is submitted at all. Every other assertion
   * in 9.6 passes on a build that draws nothing, which is the one thing 9.6 exists to prevent.
   *
   * `ParticleEmitterWebGLRenderer.js:38` calls `camera.addToRenderList(emitter)` as its **first**
   * statement, and `Camera.preRender` (`Camera.js:522-524`) empties the list at the top of every
   * frame. So reading it between frames is Phaser's own answer to *"did you actually render this
   * last frame"* — an observation rather than a re-derivation, which also bounds how far the
   * transcription above can drift.
   */
  inCameraList: number;
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
        main: {
          worldView: { x: number; y: number; width: number; height: number };
          renderList: unknown[];
        };
      };
    };
    const camera = scene.cameras.main;
    const view = camera.worldView;
    // `RectangleToRectangle`'s own predicate (`geom/intersects/RectangleToRectangle.js:24-31`), not
    // an approximation of it: zero-area rects never intersect, and touching edges DO. The strict
    // comparisons this replaces disagreed with Phaser on both — unreachable today because
    // `viewBounds` is never set, but a transcription that has already diverged in one branch is one
    // that will be trusted in another.
    const hit = (a: { x: number; y: number; width: number; height: number }): boolean =>
      a.width > 0 &&
      a.height > 0 &&
      view.width > 0 &&
      view.height > 0 &&
      a.x <= view.x + view.width &&
      a.x + a.width >= view.x &&
      a.y <= view.y + view.height &&
      a.y + a.height >= view.y;

    let drawn = 0;
    let inView = 0;
    let alive = 0;
    let emittersDrawing = 0;
    let inCameraList = 0;
    for (const emitter of Object.values(scene.effects.emitters())) {
      alive += emitter.getAliveParticleCount();
      // Phaser's own record of last frame, read before our re-derivation of the same question.
      if (camera.renderList.includes(emitter)) {
        inCameraList += 1;
      }
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
    return { drawn, inView, alive, emittersDrawing, inCameraList };
  });
}

/**
 * Put the declared worst-case ENEMY load on screen, and assert it landed.
 *
 * The delta rather than an absolute, exactly as `phase-05-perf.spec.ts` takes it: the level's own
 * enemies satisfy an absolute count on their own, and *"fast because nothing new was drawn"* is the
 * failure this excludes.
 *
 * ⚠️ `DEV_FLEET_COUNT` is a **declared** worst case, not a bound. Finding S5 in
 * `docs/qa/phase-05-combat-08-gate-10.md:121` is still open — nothing in `src/sim/` or the level
 * format caps concurrent enemies, so "max enemies" here means *the largest fleet this project
 * measures*. The particles beside them are different in kind: `atLimit()` drops rather than evicts,
 * so `SHIPPED_PEAK_ALIVE` is a ceiling by construction.
 */
export async function spawnWorstCaseFleet(page: Page): Promise<void> {
  const before = await counts(page);
  await page.keyboard.press('n');
  await waitForBodyCount(page, before.bodies + DEV_FLEET_COUNT);
  const after = await counts(page);
  expect(typeof after.sprites, 'body counts must be typed before they are compared').toBe('number');
  expect(after.bodies - before.bodies, 'the dev fleet did not spawn').toBe(DEV_FLEET_COUNT);
  // Type before value, and the vault 9.4 guard: twenty bodies swapped for the cheaper Rectangle
  // fallback still satisfies the body count, and makes every number in the spec LOOK better.
  expect(after.sprites - before.sprites, 'the fleet drew as Rectangles, not Sprites').toBe(
    DEV_FLEET_COUNT,
  );
}

/** One window, plus what was on screen while it was taken. */
export interface ArmReading {
  measured: Sample;
  particles: ParticleCounts;
  /** `perfSampler.counts()`, UNCHANGED — read per arm so the fleet is checked where it is used. */
  enemies: Awaited<ReturnType<typeof counts>>;
  /** The fraction of this window's frames on which the camera was off its base — criterion 9.5's shake. */
  shake: number;
}


/**
 * Put the page into one arm, take one window from it, and read what was drawn while it ran.
 *
 * Here rather than in the spec for the seam `polishSeries.ts` states: everything about *how the game
 * is observed* travels with the instrument, and *"a reading whose preconditions are unchecked is not
 * a reading"* — so the window's own guards live beside the call that produces them. The spec keeps
 * the claims. It is also what holds that file under the 400-line rule.
 *
 * 🔴 **The counts are read PER ARM, not once before the loop.** A fleet that went invisible,
 * zero-alpha or scale-0 partway through a run makes every millisecond bound pass *more* comfortably,
 * and a check taken before sampling started cannot see it — which is the same shape as measuring
 * particles by `getAliveParticleCount()`, one layer out.
 *
 * ⚠️ **Requires `installStorm` AND `installShakeDrive`, in that order**, and says so by throwing
 * rather than by measuring a window that quietly carried one load fewer than the criterion names.
 */
export async function sampleArm(
  page: Page,
  alive: number,
  label: string,
  /**
   * The enemy load that must still be DRAWN when this window ends. Omit where there is no fleet.
   *
   * 🔴 This is criterion 9.5's headline assertion catching up with itself. It fails with *"the worst
   * case — 20 enemies and 96 particles — left the frame budget"*, and nothing used to verify the
   * twenty were on screen while any window was taken: `spawnWorstCaseFleet` checks once, before
   * sampling, and it checks `sprites`, which is `isSprite` — the creation-time flag
   * `perfSampler.ts:137-141` records as standing blind spot **T14**. A body that went invisible,
   * zero-alpha or scale-0 still satisfies it, while making every millisecond bound pass MORE
   * comfortably. `opaque` is `willRender(camera)`, Phaser's own answer, and it is checked here — at
   * the reading — rather than twenty windows later, so the arm that lost the fleet is the one named.
   */
  drawnFleet?: { bodies: number; sprites: number },
): Promise<ArmReading> {
  // The population wait carries a 20 s bound of its own; what it does NOT carry is why it gave up.
  // Which emitter fell short, and whether the page was still painting at all, is the whole question.
  try {
    await setStorm(page, alive);
  } catch (cause) {
    throw new Error(
      `${label}: the storm never reached ${alive} live particles. ` +
        `${await stallReport(page, alive)} (${String(cause)})`,
    );
  }
  const shakeBefore: ShakeCounters = await readShakeCounters(page);
  const measured = await boundedWindow(page, alive, label);
  const shake = shakenFraction(shakeBefore, await readShakeCounters(page));
  expect(measured.frames, `${label}: too few frames to reduce`).toBeGreaterThan(MIN_SAMPLES);
  expect(measured.ticks, `${label}: short window`).toBeGreaterThanOrEqual(EFFECT_SAMPLE_TICKS);
  // 🔴 `MIN_SAMPLES = 60` over a 120-tick window accepts ~30 fps against the ~480 frames this
  // harness actually serves, so on its own it is not a precondition — it is a floor low enough to
  // admit a machine that had already fallen behind the simulation. One rAF per sim tick is the real
  // one, and it is derived rather than tuned: below it a frame is draining more than one tick and
  // the per-frame numbers stop describing per-frame work.
  expect(
    measured.frames,
    `${label}: ${measured.frames} frames served across ${measured.ticks} sim ticks — the machine ` +
      'did not keep up with the simulation, so this window is not a reading of per-frame work',
  ).toBeGreaterThanOrEqual(measured.ticks);
  // ── Guard 0c: the window carried criterion 9.5's THIRD load ────────────────────────────────────
  //
  // 🔴 9.5 names *max enemies + max particles + shake*, and the shake was absent from every window
  // this gate ever took: `installStorm` holds the player invulnerable, so nothing ever hit anything
  // and `gameEffects` never armed one. `effectShake.ts` drives it through the shipped `land` path —
  // the one arming route with no burst in it — and this is where the driving is checked rather than
  // assumed, per arm, exactly as `drawn` and `opaque` are. `PERF_MUTATION=noshake` is its red proof.
  expect(
    shake,
    `${label}: ${(shake * 100).toFixed(1)} % of this window's frames had the camera off its base. ` +
      "Criterion 9.5's worst case is max enemies AND max particles AND shake, and the bound it " +
      `asserts is a MEDIAN. The fixture predicts 100 %; under ${MIN_SHAKEN_FRAME_FRACTION * 100} % ` +
      'this is a frame budget measured with the third load missing from most of it.',
  ).toBeGreaterThanOrEqual(MIN_SHAKEN_FRAME_FRACTION);
  const reading = {
    measured,
    particles: await particleCounts(page),
    enemies: await counts(page),
    shake,
  };
  if (drawnFleet !== undefined) {
    expect(
      reading.enemies.opaque,
      `${label}: only ${reading.enemies.opaque} of ${drawnFleet.bodies} enemy bodies were drawn ` +
        'while this window ran. An undrawn fleet makes every bound in this spec EASIER, which is ' +
        'the failure 9.6 exists for, one layer out.',
    ).toBe(drawnFleet.bodies);
    expect(
      reading.enemies.sprites,
      `${label}: the fleet stopped being Sprites mid-run — the cheaper Rectangle fallback satisfies ` +
        'a body count and makes the frame budget look better',
    ).toBe(drawnFleet.sprites);
  }
  return reading;
}

/** One arm of the paired design, ten readings deep. Parallel arrays, one entry per pair. */
export interface PairArm {
  work: number[];
  p95: number[];
  drawn: number[];
  opaque: number[];
  sprites: number[];
}

/**
 * Walk `pairs` AB/BA pairs at the shipped peak — the paired half of criterion 9.5.
 *
 * Split out of `phase-09-perf.spec.ts` in the 9.5 fix round, symmetrically with `effectSweep.ts`'s
 * `walkSweep`, and it belongs here for the reason this file's header gives: it is a *reading*, and
 * every line of it is a call into `sampleArm`.
 *
 * 🔴 **Alternating order, never a fixed one.** `phase-07-perf.spec.ts`'s correction verbatim: a fixed
 * order does not cancel a first-position penalty, it ATTRIBUTES it to the treatment arm.
 *
 * 🔴 **The ENEMY drawn count is recorded per arm.** The assertion this walk feeds names twenty
 * enemies, and until it landed nothing checked they were on screen while the windows were taken.
 * `sprites` is `isSprite`, a creation-time flag — `perfSampler.ts:137-141` records it as standing
 * blind spot T14 for exactly this reason — so it is kept only as the "still Sprites, not Rectangles"
 * half and `opaque` (`willRender`) carries the drawn claim.
 */
export async function walkPairs(
  page: Page,
  pairs: number,
  peak: number,
  fleet: { bodies: number; sprites: number },
  shakes: number[],
): Promise<Record<'on' | 'off', PairArm>> {
  const blank = (): PairArm => ({ work: [], p95: [], drawn: [], opaque: [], sprites: [] });
  const arms: Record<'on' | 'off', PairArm> = { on: blank(), off: blank() };
  for (let pair = 0; pair < pairs; pair += 1) {
    const order = pair % 2 === 0 ? (['on', 'off'] as const) : (['off', 'on'] as const);
    for (const name of order) {
      const arm = await sampleArm(page, name === 'on' ? peak : 0, `arm ${name}, pair ${pair}`, fleet);
      arms[name].work.push(arm.measured.workMedianMs);
      arms[name].p95.push(arm.measured.workP95Ms);
      arms[name].drawn.push(arm.particles.drawn);
      arms[name].opaque.push(arm.enemies.opaque);
      arms[name].sprites.push(arm.enemies.sprites);
      shakes.push(arm.shake);
    }
  }
  return arms;
}
