/**
 * # Phase 9, criterion 9.6 — the measurement can tell "fast" from "not drawing anything".
 *
 * ## Why this is a separate file from `phase-09-perf.spec.ts`, and why it comes first
 *
 * *A frame budget that a blank screen passes is worse than no gate*, because a build that stopped
 * drawing gets FASTER and every millisecond assertion in the budget spec gets easier. This project
 * has shipped that shape twice — twelve of twenty enemies as grey-box Rectangles with every gate
 * green, and a death fade that played a whole ten-frame KO at 35 % opacity while the sampler
 * reported ten of ten poses painted *(vault 9.4)*. So 9.6 is a statistic that reads **zero** when
 * nothing is being drawn, and 9.5 does not get to be trusted until it holds.
 *
 * The two started as one file and split when it crossed the 400-line rule under review fixes. The
 * seam is the criterion boundary, which is the honest one: this file asks *was anything drawn*, and
 * `phase-09-perf.spec.ts` asks *what did drawing it cost*. **Neither depends on the other's
 * ordering** — 9.5 carries its own per-arm copy of this statistic in its Guard 0 and Guard 0b, so
 * nothing here is load-bearing for it by being alphabetically earlier.
 *
 * `effectBudget.ts` holds every constant, `effectCounts.ts` the counter and its transcription,
 * `effectMutation.ts` the committed mutations and the storm. This file states claims and asserts
 * them, and nothing else.
 *
 * ## The mutations, each one shell variable
 *
 * ```
 * PERF_MUTATION=scale0         npm run test:e2e -- tests/e2e/phase-09-draw.spec.ts
 * PERF_MUTATION=particlescale0 npm run test:e2e -- tests/e2e/phase-09-draw.spec.ts
 * ```
 *
 * Anything `namedMutation` does not recognise **throws**: a proof that silently ran clean reports a
 * green suite, which is the most convincing possible evidence that nothing was tested.
 *
 * ## ⚠️ Stated limits *(vault 9.3)*
 *
 *  - **The COUNT measures submission, not pixels.** It answers "would Phaser draw this", by Phaser's
 *    own predicate and render list, and cannot tell a particle drawn behind an opaque wall from one
 *    drawn in the open — 9.8's hands-on pass is where someone looks at the screen. What it no longer
 *    misses is a submitted quad with *nothing in it*: the last describe here reads the generated
 *    texture's pixels, after `fillStyle(spec.tint, 0)` made every particle invisible at `drawn 96`.
 *  - **`TINT_MODE_ADD`'s pin moved OUT** to `tests/unit/engine-literals.test.ts`, which pins all
 *    three literals in the UNIT suite — a Phaser upgrade cannot slip past a run that skipped
 *    Playwright. The copy here was the strictly weaker of two; that file's header has the argument.
 *  - **The transcription follows the WebGL path**, which `assertRealGpu` guarantees is the one in
 *    use. The Canvas fallback additionally tests `emitter.visible` and multiplies by `camera.alpha`
 *    (`ParticleEmitterCanvasRenderer.js:61,78`), so under `Phaser.AUTO`'s Canvas fallback a camera
 *    faded to alpha 0 would draw nothing while `drawn` still read 96.
 */

import { expect, test } from '@playwright/test';

import { EMITTER_SPECS } from '../../src/render/effects';
import {
  EFFECT_KINDS,
  MIN_DRAWN_AT_PEAK,
  SHIPPED_PEAK_ALIVE,
  SWEEP_ALIVE,
} from './effectBudget';
import { particleCounts } from './effectCounts';
import { OFFSCREEN_KINDS, setStormOffscreen } from './effectOffscreen';
import {
  installStorm,
  namedMutation,
  setEmitterScale,
  setParticleScale,
  setStorm,
  stormCaps,
} from './effectMutation';
import { bootToGame } from './gameHarness';
import { particlePixels, tintChannels } from './particlePixels';
import { counts } from './perfSampler';
import { installRecorder, stopDriving, TAIL_TICKS, waitFor } from './polishSeries';
import { assertRealGpu } from './realGpu';

declare const process: { env: Record<string, string | undefined> };

const MUTATION = namedMutation(process.env.PERF_MUTATION ?? '');

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

test.describe('Phase 9 — criterion 9.6, the drawn-particle count', () => {
  /**
   * 🔴 **The load-bearing statistic is a per-particle DRAW-SUBMISSION count, not
   * `getAliveParticleCount()`**, and the difference is the whole criterion. An alive count is
   * emitter bookkeeping: at `setScale(0)` every particle stays alive, stays `visible`, keeps
   * `alpha: 1` and a valid position, and **draws nothing** — while making the frame cheaper.
   * `perfSampler.ts:212-224` closed that exact hole one layer down for enemy bodies on Codex 5.14
   * blocker 1, by asking Phaser's own `willRender(camera)` instead of guessing at exclusion routes.
   *
   * A Phaser 4 `Particle` is not a Game Object and has no `willRender`, so `particleCounts` asks the
   * question the same way at one remove: the emitter's own `willRender(camera)`, then the exact
   * per-particle `continue` from `ParticleEmitterWebGLRenderer.js:82-87`, and then Phaser's own
   * record of whether it actually rendered each emitter last frame. `effectCounts.ts` carries the
   * transcription and the citations.
   *
   * ### Three gates in one predicate, and each needs its own proof
   *
   *  - `PERF_MUTATION=scale0` — the **emitter transform** gate. It also reds 9.5's Guard 0.
   *  - `PERF_MUTATION=particlescale0` — the **per-particle** gate. `scale0` never reaches that
   *    branch (it stops at the emitter, with `emittersDrawing` 0), so without this proof half the
   *    transcription is a decoration that has never excluded anything *(vault C2)*.
   *  - The **display-list** gate needs no mutation: `inCameraList` is Phaser's own record rather
   *    than a re-derivation, and `effectCounts.ts` carries the `scene.make.particles` scenario it
   *    closes — a one-token regression that passes every other assertion here.
   */
  test('the drawn-particle count is zero with the effects off and pinned non-zero with them on', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await bootToGame(page);
    const renderer = await assertRealGpu(page, '9.6');
    await installStorm(page);

    // The storm at the shipped peak IS the shipped configuration, not a lookalike. Asserted rather
    // than asserted-in-a-comment, and asserted for every sweep point, because a rounding that did
    // not sum back would make "N particles" a different N in 9.5's table.
    for (const kind of EFFECT_KINDS) {
      expect(
        stormCaps(SHIPPED_PEAK_ALIVE)[kind],
        `the storm at ${SHIPPED_PEAK_ALIVE} must reproduce the shipped ${kind} ceiling exactly`,
      ).toBe(EMITTER_SPECS[kind].maxAliveParticles);
    }
    for (const n of SWEEP_ALIVE) {
      expect(sum(Object.values(stormCaps(n))), `the ${n}-particle split does not sum back`).toBe(n);
    }

    await setStorm(page, 0);
    const offCounts = await counts(page);
    const off = await particleCounts(page);

    // 🔴 Applied BEFORE the population is created, and that ordering is load-bearing for
    // `particlescale0`. A constant `EmitterOp` is emit-only: `setMethods` leaves `onUpdate` as
    // `defaultUpdate`, which returns the particle's existing value unchanged
    // (`EmitterOp.js:453,624-627`). So a scale op set to 0 governs particles emitted AFTER it and
    // never touches the ones already flying. `setStorm` kills and refills, so ordering it second is
    // what makes the whole population inherit the mutation. Applied the other way round the run went
    // green at `drawn 96` — a mutation that did nothing, one paste away from being recorded as a
    // proof.
    //
    // Both are also restored under the SAME condition that applies them. Writing scale 1
    // unconditionally was inert only because `createEmitter` happens never to set a transform scale;
    // a fixture that is harmless by coincidence is a fixture waiting to stop being harmless.
    if (MUTATION === 'scale0') {
      await setEmitterScale(page, 0);
    }
    if (MUTATION === 'particlescale0') {
      await setParticleScale(page, 0);
    }
    // The same ordering, for the same reason, and here it is what makes the fixture DISTINGUISHING
    // rather than merely red: applied after the population exists it would read `inView 96`.
    if (MUTATION === 'halfoffscreen') {
      await setStormOffscreen(page, OFFSCREEN_KINDS);
    }
    await setStorm(page, SHIPPED_PEAK_ALIVE);
    const onCounts = await counts(page);
    const on = await particleCounts(page);
    if (MUTATION === 'scale0') {
      await setEmitterScale(page, 1);
    }
    if (MUTATION === 'particlescale0') {
      await setParticleScale(page, null);
    }
    if (MUTATION === 'halfoffscreen') {
      await setStormOffscreen(page, []);
    }
    await setStorm(page, 0);

    // Type before value *(vault C1)*: everything here comes off the untyped `__phaserGame` route,
    // and a debug hook that returns nothing passes every comparison vacuously.
    for (const [field, value] of Object.entries(on)) {
      expect(typeof value, `particleCounts().${field} must be a number`).toBe('number');
    }

    // eslint-disable-next-line no-console
    console.log(
      `[9.6] renderer ${renderer} | off drawn ${off.drawn} inView ${off.inView} alive ${off.alive} ` +
        `emitters ${off.emittersDrawing} rendered ${off.inCameraList} | on drawn ${on.drawn} inView ` +
        `${on.inView} alive ${on.alive} emitters ${on.emittersDrawing} rendered ${on.inCameraList} ` +
        `| enemies drawn ${offCounts.opaque}/${onCounts.opaque}`,
    );

    // ── The OFF arm draws exactly nothing ──────────────────────────────────────────────────────
    expect(off.drawn, 'the effects-off arm submitted particles — the arms are the same arm').toBe(0);
    expect(off.alive, 'the effects-off arm still holds live particles').toBe(0);

    // ── The ON arm draws, and the count is PINNED as a literal ─────────────────────────────────
    //
    // Both mutations leave `alive` at the ceiling and take `drawn` to zero, by two different routes,
    // so this is the assertion that separates a drawing build from a bookkeeping one.
    expect(
      on.drawn,
      `the effects-on arm submitted ${on.drawn} particles to the batch while holding ${on.alive} ` +
        'alive. A particle that is alive and not drawn is the whole failure 9.6 exists for: it ' +
        'reports visible, reports alpha 1, and makes the frame budget in 9.5 CHEAPER.',
    ).toBeGreaterThanOrEqual(MIN_DRAWN_AT_PEAK);
    expect(
      on.emittersDrawing,
      'an emitter was excluded from rendering entirely — its transform, visibility or view bounds',
    ).toBe(EFFECT_KINDS.length);
    // 🔴 Phaser's own record, and it is not redundant with the line above. `willRender` returns TRUE
    // for an object on no display list (`GameObject.js:709`), so `scene.make.particles` in place of
    // `scene.add.particles` passes every other assertion here while submitting nothing at all.
    expect(
      on.inCameraList,
      `only ${on.inCameraList} of ${EFFECT_KINDS.length} emitters were in the camera's render list ` +
        'last frame. The renderer never reached them, whatever `willRender` says — an emitter off ' +
        'the display list reports true and draws nothing.',
    ).toBe(EFFECT_KINDS.length);
    // Submission is the honest statistic for a main-thread budget (Phaser culls no particle), but a
    // storm somewhere the camera cannot see is still not a drawn effect. Both, so neither can lie.
    // 🔴 A COUNT, not a `> 0`. It read `toBeGreaterThan(0)` under the message *"every submitted
    // particle was outside the camera"* — which 95 of 96 off-camera passes, so the message named the
    // only failure the assertion could not detect. The same floor `drawn` carries, for the same
    // reason: two thirds of the ceiling is far above what a broken path produces and far below what a
    // working one does. Proved in its own DISTINGUISHING range by `PERF_MUTATION=halfoffscreen`, which
    // reads `drawn 96 inView 48` — red here at `Expected >= 64`, and GREEN under the `> 0` it replaced.
    expect(
      on.inView,
      `only ${on.inView} of the ${on.drawn} submitted particles were inside the camera's world view`,
    ).toBeGreaterThanOrEqual(MIN_DRAWN_AT_PEAK);

    // ── The enemies are not what changed ───────────────────────────────────────────────────────
    expect(onCounts.sprites, 'the enemy sprite count moved between arms').toBe(offCounts.sprites);
    expect(onCounts.opaque, 'the enemy drawn count moved between arms').toBe(offCounts.opaque);
  });
});

/**
 * 🔴 Does a GAME EVENT produce particles? Nothing in the project asked, and the answer was untested.
 *
 * `gameEffects.ts`'s `emit` mutated to `emitter.explode(0, burst.x, burst.y)` — **every in-game
 * spark, steam and dust burst drawing nothing** — left the unit suite at 2073/2073 with `tsc` clean.
 * Deleting `strike()`'s spark loop outright was also green.
 *
 * And the two criteria that look like they cover it do not, for a mechanical reason rather than an
 * inferred one: `installStorm` (`effectMutation.ts`) calls `emitter.explode(deficit, x, y)` on
 * handles taken straight from `scene.effects.emitters()`, so **9.5 and 9.6 measure the storm and
 * never `gameEffects.emit` at all**. `effectBudget.ts` disclosed the narrowing and then cited a
 * covering gate that did not exist.
 *
 * So: **no storm here.** The only thing that fires an emitter in this test is the game, reacting to a
 * landing the player actually performed. That is the whole design.
 *
 * ## Why a per-frame PEAK and not a point read
 *
 * `dust.lifespanTicks` is a fraction of a second, and this harness drains ~2.7 sim ticks per frame
 * right after boot — a `particleCounts(page)` taken after the wait resolves would very often read a
 * burst that has already expired, and report "no particles" for a build that drew them. The sampler
 * runs once per animation frame inside the page and returns an aggregate *(TESTING-RULES: a wait
 * expressed in ticks cannot bound a sampling window)*.
 */
test.describe('Phase 9 — the game’s OWN trigger path emits particles', () => {
  test('a landing the player performed produces drawn dust, with no storm installed', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await bootToGame(page);
    const renderer = await assertRealGpu(page, 'trigger-path');

    // Installed BEFORE anything is triggered, so no burst can happen between boot and the sampler.
    await page.evaluate(() => {
      type G = { __phaserGame: { scene: { getScene(k: string): unknown } } };
      const w = window as unknown as G & { __peak?: unknown; __peakRaf?: number };
      const scene = w.__phaserGame.scene.getScene('Game') as {
        effects: { emitters(): Record<string, unknown> };
        cameras: { main: unknown };
      };
      const camera = scene.cameras.main;
      const peak: Record<string, { alive: number; drawnFrames: number; emitting: boolean }> = {};
      const step = (): void => {
        const emitters = scene.effects.emitters() as Record<
          string,
          {
            getAliveParticleCount(): number;
            willRender(c: unknown): boolean;
            emitting: boolean;
          }
        >;
        for (const [kind, emitter] of Object.entries(emitters)) {
          const alive = emitter.getAliveParticleCount();
          const entry = (peak[kind] ??= { alive: 0, drawnFrames: 0, emitting: false });
          entry.alive = Math.max(entry.alive, alive);
          entry.emitting ||= emitter.emitting;
          if (alive > 0 && emitter.willRender(camera)) entry.drawnFrames += 1;
        }
        w.__peakRaf = requestAnimationFrame(step);
      };
      w.__peak = peak;
      w.__peakRaf = requestAnimationFrame(step);
    });

    await installRecorder(page);
    // Positive terminal conditions only, never a sleep: the harness's own resolution first, then a
    // real touchdown recorded in the tick series, then a tail long enough to hold the burst.
    await waitFor(page, { kind: 'run', n: 12 });
    await page.keyboard.down('Space');
    await waitFor(page, { kind: 'land', n: TAIL_TICKS });
    await page.keyboard.up('Space');

    const peak = await page.evaluate(() => {
      const w = window as unknown as {
        __peak: Record<string, { alive: number; drawnFrames: number; emitting: boolean }>;
        __peakRaf?: number;
      };
      if (w.__peakRaf !== undefined) cancelAnimationFrame(w.__peakRaf);
      return w.__peak;
    });
    await stopDriving(page);

    // eslint-disable-next-line no-console
    console.log(
      `[trigger] renderer ${renderer} | ` +
        EFFECT_KINDS.map(
          (k) => `${k} alive ${peak[k]?.alive} frames ${peak[k]?.drawnFrames}`,
        ).join(' | '),
    );

    // Type before value *(vault C1)* — every number here came off the untyped `__phaserGame` route,
    // and a hook that returned nothing would pass every comparison below vacuously.
    for (const kind of EFFECT_KINDS) {
      expect(peak[kind], `no sample was recorded for ${kind}`).toBeDefined();
      expect(typeof peak[kind].alive, `${kind}.alive must be a number`).toBe('number');
    }

    // 🔴 THE assertion. A landing is a `Burst` decided by `landingDust` and turned into particles by
    // `gameEffects.emit`. Zero here means the whole trigger path is dead — which is exactly the
    // state `explode(0, …)` produces, and exactly what every other gate in this phase reported as
    // healthy.
    expect(
      peak.dust.alive,
      `the player landed and the dust emitter never held a particle. The burst path from ` +
        `landingDust -> emit -> explode is dead; 9.5 and 9.6 cannot see this because installStorm ` +
        `calls explode on the emitter handles directly.`,
    ).toBeGreaterThan(0);

    // And they were SUBMITTED, not merely alive. `alive` is emitter bookkeeping — at `setScale(0)`
    // every particle stays alive, visible and positioned, and draws nothing (9.6's whole argument).
    expect(
      peak.dust.drawnFrames,
      'dust particles were alive but the emitter never passed willRender',
    ).toBeGreaterThan(0);

    // Non-vacuity of a different kind: these are EXPLOSIONS. A `createEmitter` mutated to
    // `emitting: true` would give every kind a permanent fountain at (0, 0) and satisfy the two
    // assertions above without a landing ever happening.
    for (const kind of EFFECT_KINDS) {
      expect(peak[kind].emitting, `${kind} is a continuous fountain, not a burst`).toBe(false);
    }
  });
});

/**
 * 🔴 **The generated texture has opaque pixels, in the spec's colour** — the boundary every other
 * gate in this phase stopped one layer short of. `particlePixels.ts`'s header carries the argument
 * and the mutation that proved it was needed; the two red proofs are:
 *
 * ```
 * particleTexture.ts:48   fillStyle(spec.tint, 1) -> fillStyle(spec.tint, 0)   // alpha
 * particleTexture.ts:48   fillStyle(spec.tint, 1) -> fillStyle(0xffffff, 1)    // colour
 * ```
 *
 * The first is Codex implementation review finding 2, verified green across the whole suite —
 * including 9.6 on a real GPU at `drawn 96 inView 96` — before this existed.
 */
test.describe('the particle textures are actually drawn, not merely submitted', () => {
  test('every generated dot is opaque at its centre and carries its spec tint', async ({ page }) => {
    await bootToGame(page);
    const pixels = await particlePixels(page);

    for (const kind of EFFECT_KINDS) {
      const px = pixels[kind];
      // Type before value *(vault C1)*: every number came off the untyped `__phaserGame` route.
      expect(px, `no pixels were sampled for ${kind}`).toBeDefined();
      const key = px.key;
      expect(typeof px.centre[3], `${key} alpha must be a number`).toBe('number');
      expect(px.width, `${key} is a zero-sized texture`).toBeGreaterThan(1);

      expect(
        px.centre[3],
        `${key} is TRANSPARENT at its centre. Every particle in the game is invisible and every ` +
          `other gate in this phase is green: 9.6 counts draw SUBMISSION, and Phaser submits a ` +
          `fully transparent quad exactly as happily as an opaque one.`,
      ).toBe(255);
      expect(
        [px.centre[0], px.centre[1], px.centre[2]],
        `${key} was baked in the wrong colour. EmitterSpec.tint is the art direction for this ` +
          `burst; a dot that ignores it is a white dot with a table nobody reads.`,
      ).toEqual(tintChannels(kind));

      // Non-vacuity, and the claim that it is a DOT: a texture filled corner to corner satisfies
      // everything above, and a square's corner is outside the circle inscribed in it.
      expect(
        px.corner[3],
        `${key} is opaque in its corner — this is a filled square, not the dot the emitter sizes`,
      ).toBe(0);
    }
  });
});

