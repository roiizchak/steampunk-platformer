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
 *  - **This measures SUBMISSION, not pixels.** It answers "would Phaser draw this", by Phaser's own
 *    predicate and Phaser's own render list. It cannot tell a particle drawn behind an opaque wall
 *    from one drawn in the open. Criterion 9.8's hands-on pass is where someone looks at the screen.
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
import {
  installStorm,
  namedMutation,
  setEmitterScale,
  setParticleScale,
  setStorm,
  stormCaps,
} from './effectMutation';
import { bootToGame } from './gameHarness';
import { counts } from './perfSampler';
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
    await setStorm(page, SHIPPED_PEAK_ALIVE);
    const onCounts = await counts(page);
    const on = await particleCounts(page);
    if (MUTATION === 'scale0') {
      await setEmitterScale(page, 1);
    }
    if (MUTATION === 'particlescale0') {
      await setParticleScale(page, null);
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
    expect(on.inView, 'every submitted particle was outside the camera').toBeGreaterThan(0);

    // ── The enemies are not what changed ───────────────────────────────────────────────────────
    expect(onCounts.sprites, 'the enemy sprite count moved between arms').toBe(offCounts.sprites);
    expect(onCounts.opaque, 'the enemy drawn count moved between arms').toBe(offCounts.opaque);
  });
});
