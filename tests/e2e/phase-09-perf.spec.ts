/**
 * # Phase 9, criteria 9.5 and 9.6 — the frame budget under the worst case, and the guard that stops
 * a blank screen from passing it.
 *
 * ## 9.6 runs FIRST, and it is not a formality
 *
 * *A frame budget that a blank screen passes is worse than no gate*, because a build that stopped
 * drawing gets FASTER and every millisecond assertion in this file gets easier. This project has
 * shipped that shape twice — twelve of twenty enemies as grey-box Rectangles with every gate green,
 * and a death fade that played a whole ten-frame KO at 35 % opacity while the sampler reported ten
 * of ten poses painted *(vault 9.4)*. So the first test asserts the frames were **drawing
 * particles**, by a statistic that is zero when they are not, and nothing in the second test is
 * trusted until it holds.
 *
 * ## What the two tests measure, and the seam between them
 *
 * `effectBudget.ts` argues the statistic and holds every constant; `effectMutation.ts` holds the two
 * committed proving mutations and the storm that drives the real emitters. This file states the
 * claims and asserts them, and nothing else.
 *
 * ## Both mutations are one shell variable — neither has to be reinvented
 *
 * ```
 * PERF_MUTATION=scale0    npm run test:e2e -- tests/e2e/phase-09-perf.spec.ts   # 9.6 goes red
 * PERF_MUTATION=storm8192 npm run test:e2e -- tests/e2e/phase-09-perf.spec.ts   # 9.5 goes red
 * ```
 *
 * ## ⚠️ Stated limits *(vault 9.3 — a gate's blind spots are part of its result)*
 *
 *  - **"Max enemies" here means the largest fleet this project MEASURES, not the largest possible.**
 *    `DEV_FLEET_COUNT` is a chosen 10x multiple; finding S5 in
 *    `docs/qa/phase-05-combat-08-gate-10.md:121` is still open and nothing in `src/sim/` or the level
 *    format caps concurrent enemies. Particles are different in kind — they are bounded **by
 *    construction** at `SHIPPED_PEAK_ALIVE`, because `atLimit()` drops rather than evicts.
 *  - **The shipped 96-particle cost is below this browser's clock grid**, so it is not read
 *    directly. `performance.now()` quantises to 0.1 ms here; 96 particles do not clear that. What is
 *    measured is the amplified storm and what is reported is the delta over the count — which is a
 *    measurement only while the sweep is linear, and the spec asserts that rather than assuming it.
 *  - **No GPU timer is installed, deliberately.** These particles are a main-thread cost —
 *    `preUpdate` walks every alive particle through its `EmitterOp`s and the renderer builds one
 *    quad each, while the pixels are three 12 px dots' worth of fill. A GPU ratio is the wrong
 *    instrument and 6.9's history is what that costs. Installing the timer would also add its own
 *    per-frame work to the very absolute bound this file asserts.
 *  - **An absolute millisecond from this harness is not one from a player's machine.** The renderer
 *    is asserted and printed for exactly that reason.
 */

import { expect, test } from '@playwright/test';

import { EMITTER_SPECS } from '../../src/render/effects';
import {
  CLOCK_GRID_MS,
  EFFECT_KINDS,
  MAX_EFFECT_FRAME_WORK_MS,
  MAX_EFFECT_WORK_DELTA_MS,
  MAX_LINEARITY_SPREAD,
  MAX_PER_PARTICLE_WORK_MS,
  MIN_DRAWN_AT_PEAK,
  MIN_STORM_WORK_DELTA_MS,
  PAIRS,
  SHIPPED_PEAK_ALIVE,
  STORM_ALIVE,
  SWEEP_ALIVE,
  particleCounts,
} from './effectBudget';
import {
  installStorm,
  sampleArm,
  setEmitterScale,
  setStorm,
  spawnWorstCaseFleet,
  stormCaps,
  stormCount,
  wantsZeroScale,
} from './effectMutation';
import { bootToGame } from './gameHarness';
import { median } from './levelPerf';
import { DEV_FLEET_COUNT } from './perfBudget';
import { counts } from './perfSampler';
import { assertRealGpu } from './realGpu';

declare const process: { env: Record<string, string | undefined> };

const MUTATION = process.env.PERF_MUTATION ?? '';

/** How many times the whole sweep is walked. Odd, so the median of each point is a real reading. */
const SWEEP_ROUNDS = 5;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

test.describe('Phase 9 — criteria 9.5 and 9.6, the effect frame budget', () => {
  /**
   * ## 9.6 — the measurement can tell "fast" from "not drawing anything"
   *
   * 🔴 **The load-bearing statistic is a per-particle DRAW-SUBMISSION count, not
   * `getAliveParticleCount()`**, and the difference is the whole criterion. An alive count is
   * emitter bookkeeping: at `setScale(0)` every particle stays alive, stays `visible`, keeps
   * `alpha: 1` and a valid position, and **draws nothing** — while making the frame cheaper.
   * `perfSampler.ts:212-224` closed that exact hole one layer down for enemy bodies on Codex 5.14
   * blocker 1, by asking Phaser's own `willRender(camera)` instead of guessing at exclusion routes.
   *
   * A Phaser 4 `Particle` is not a Game Object and has no `willRender`, so `particleCounts` asks the
   * question the same way at one remove: the emitter's own `willRender(camera)`, then the exact
   * per-particle `continue` from `ParticleEmitterWebGLRenderer.js:80-84`. `effectBudget.ts` carries
   * the transcription and the citation.
   *
   * The `setScale(0)` red proof is `PERF_MUTATION=scale0` — the mutation this assertion NAMES, not a
   * convenient one.
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
    // not sum back would make "N particles" a different N in the table below.
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

    await setStorm(page, SHIPPED_PEAK_ALIVE);
    if (wantsZeroScale(MUTATION)) {
      await setEmitterScale(page, 0);
    }
    const onCounts = await counts(page);
    const on = await particleCounts(page);
    await setEmitterScale(page, 1);
    await setStorm(page, 0);

    // Type before value *(vault C1)*: everything here comes off the untyped `__phaserGame` route,
    // and a debug hook that returns nothing passes every comparison vacuously.
    for (const [field, value] of Object.entries(on)) {
      expect(typeof value, `particleCounts().${field} must be a number`).toBe('number');
    }

    // eslint-disable-next-line no-console
    console.log(
      `[9.6] renderer ${renderer} | off drawn ${off.drawn} inView ${off.inView} alive ${off.alive} ` +
        `emitters ${off.emittersDrawing} | on drawn ${on.drawn} inView ${on.inView} alive ` +
        `${on.alive} emitters ${on.emittersDrawing} | enemies drawn ${offCounts.opaque}/${onCounts.opaque}`,
    );

    // ── The OFF arm draws exactly nothing ──────────────────────────────────────────────────────
    expect(off.drawn, 'the effects-off arm submitted particles — the arms are the same arm').toBe(0);
    expect(off.alive, 'the effects-off arm still holds live particles').toBe(0);

    // ── The ON arm draws, and the count is PINNED as a literal ─────────────────────────────────
    //
    // `setScale(0)` leaves `alive` at the ceiling and takes `drawn` to zero, so this is the
    // assertion that separates a drawing build from a bookkeeping one.
    expect(
      on.drawn,
      `the effects-on arm submitted ${on.drawn} particles to the batch while holding ${on.alive} ` +
        'alive. A particle that is alive and not drawn is the whole failure 9.6 exists for: it ' +
        'reports visible, reports alpha 1, and makes the frame budget below CHEAPER.',
    ).toBeGreaterThanOrEqual(MIN_DRAWN_AT_PEAK);
    expect(
      on.emittersDrawing,
      'an emitter was excluded from rendering entirely — its transform, visibility or view bounds',
    ).toBe(EFFECT_KINDS.length);
    // Submission is the honest statistic for a main-thread budget (Phaser culls no particle), but a
    // storm somewhere the camera cannot see is still not a drawn effect. Both, so neither can lie.
    expect(on.inView, 'every submitted particle was outside the camera').toBeGreaterThan(0);

    // ── The enemies are not what changed ───────────────────────────────────────────────────────
    expect(onCounts.sprites, 'the enemy sprite count moved between arms').toBe(offCounts.sprites);
    expect(onCounts.opaque, 'the enemy drawn count moved between arms').toBe(offCounts.opaque);
  });

  /**
   * ## 9.5 — the frame budget holds under the worst case
   *
   * ### The statistic, and why it is not a GPU ratio
   *
   * Main-thread `workMedianMs` from `perfSampler.sample()`. Particles are a CPU cost here: alive
   * count times up to fifteen `EmitterOp` evaluations plus processors, then one quad built per
   * particle on the main thread. Criterion 6.9's GPU ratio ranked five full-screen scrims BELOW a
   * clean run, and the rule that came out of it is that a statistic which cannot order its own
   * mutation is replaced rather than re-bounded.
   *
   * ### The sweep is what earns the bound
   *
   * `SWEEP_ALIVE` is walked `SWEEP_ROUNDS` times, alternating direction, and the per-point medians
   * must be **monotone non-decreasing in N** before any threshold is applied to any of them. This
   * gate does not exist until they order.
   *
   * ### The pairs are what make the absolute number trustworthy
   *
   * Ten AB/BA pairs at the shipped peak, in the same page, seconds apart, taking the **median of the
   * ten per-pair deltas** rather than the delta of two medians — the correction
   * `phase-07-perf.spec.ts` records, where medians-of-medians could not separate a clean run from a
   * mutated one that per-pair separated with no overlap at all.
   */
  test('the worst case stays inside the frame budget, and the cost rises with the particle count', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await bootToGame(page);
    const renderer = await assertRealGpu(page, '9.5');
    await installStorm(page);
    await spawnWorstCaseFleet(page);
    // 🔴 `scale0` is applied HERE too, and not only in the 9.6 test. Guard 0 below is 9.6's statistic
    // standing in front of this file's milliseconds, and a guard that is never run against the
    // mutation it exists for is decoration. Under `scale0` every window still holds its full
    // population, still reports it alive, and draws none of it — which makes each arm CHEAPER and
    // every bound below easier. Guard 0 is what turns that into a failure instead of a good result.
    if (wantsZeroScale(MUTATION)) {
      await setEmitterScale(page, 0);
    }

    // ── The sweep ──────────────────────────────────────────────────────────────────────────────
    const sweep = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
    const sweepDrawn = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
    for (let round = 0; round < SWEEP_ROUNDS; round += 1) {
      // Alternating direction, for `PAIRS`'s reason: a fixed walk order gives every low point a
      // colder machine than every high point, and that bias is exactly the shape the sweep looks for.
      const order = round % 2 === 0 ? [...SWEEP_ALIVE] : [...SWEEP_ALIVE].reverse();
      for (const n of order) {
        const measured = await sampleArm(page, n, `sweep N=${n}, round ${round}`);
        sweep.get(n)!.push(measured.workMedianMs);
        sweepDrawn.get(n)!.push((await particleCounts(page)).drawn);
      }
    }
    const sweepWork = SWEEP_ALIVE.map((n) => median(sweep.get(n)!));
    const table = SWEEP_ALIVE.map(
      (n, i) =>
        `N=${String(n).padStart(4)}  work ${sweepWork[i]!.toFixed(3)} ms  ` +
        `(runs ${sweep.get(n)!.map((v) => v.toFixed(3)).join('/')}; ` +
        `drawn ${sweepDrawn.get(n)!.join('/')})`,
    );

    // ── The pairs, at the shipped peak ─────────────────────────────────────────────────────────
    const peak = stormCount(MUTATION) || SHIPPED_PEAK_ALIVE;
    const arms: Record<'on' | 'off', { work: number[]; drawn: number[] }> = {
      on: { work: [], drawn: [] },
      off: { work: [], drawn: [] },
    };
    for (let pair = 0; pair < PAIRS; pair += 1) {
      const order = pair % 2 === 0 ? (['on', 'off'] as const) : (['off', 'on'] as const);
      for (const arm of order) {
        const measured = await sampleArm(page, arm === 'on' ? peak : 0, `arm ${arm}, pair ${pair}`);
        arms[arm].work.push(measured.workMedianMs);
        arms[arm].drawn.push((await particleCounts(page)).drawn);
      }
    }
    await setStorm(page, 0);

    const onWork = median(arms.on.work);
    const offWork = median(arms.off.work);
    const pairDeltas = arms.on.work.map((w, i) => w - arms.off.work[i]!);
    const delta = median(pairDeltas);

    // The amplified storm, divided back. Floored at zero: a delta under the noise can come back
    // negative, and "particles cost less than nothing" is the same statement as "under the floor".
    const stormDelta = sweepWork[SWEEP_ALIVE.indexOf(STORM_ALIVE)]! - sweepWork[0]!;
    const halfIndex = SWEEP_ALIVE.length - 2;
    const halfN = SWEEP_ALIVE[halfIndex]!;
    const perParticle = Math.max(0, stormDelta / STORM_ALIVE);
    const perParticleHalf = Math.max(0, (sweepWork[halfIndex]! - sweepWork[0]!) / halfN);

    const fmt = (v: number[]): string => v.map((x) => x.toFixed(3)).join('/');
    const detail = [
      '',
      `[9.5] renderer ${renderer}`,
      ...table.map((row) => `      ${row}`),
      `      peak ${peak} on ${fmt(arms.on.work)}`,
      `      peak ${peak} off ${fmt(arms.off.work)}`,
      `      pair deltas ${fmt(pairDeltas)}`,
      `      drawn on ${arms.on.drawn.join('/')} vs off ${arms.off.drawn.join('/')}`,
      `      median work on ${onWork.toFixed(3)} ms, off ${offWork.toFixed(3)} ms, ` +
        `paired delta ${delta.toFixed(4)} ms (bound ${MAX_EFFECT_WORK_DELTA_MS})`,
      `      absolute ${onWork.toFixed(3)} ms (bound ${MAX_EFFECT_FRAME_WORK_MS})`,
      `      per particle ${perParticle.toFixed(5)} ms at ${STORM_ALIVE}, ` +
        `${perParticleHalf.toFixed(5)} ms at ${halfN} (bound ${MAX_PER_PARTICLE_WORK_MS})`,
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(detail);

    // ── Guard 0: the arms really did differ in DRAWN particles ─────────────────────────────────
    //
    // 9.6's statistic, applied per arm, before a millisecond is compared. A cheap frame that drew
    // nothing fails HERE. Both directions, because "the on arm drew" alone still passes when the off
    // arm drew too — which is the null mutation for a paired design.
    for (let pair = 0; pair < PAIRS; pair += 1) {
      expect(arms.on.drawn[pair], `pair ${pair}: the effects-on window drew no particles`).toBeGreaterThan(
        0,
      );
      expect(arms.off.drawn[pair], `pair ${pair}: the effects-off window drew particles`).toBe(0);
    }
    for (const n of SWEEP_ALIVE) {
      const drawn = sweepDrawn.get(n)!;
      if (n === 0) {
        expect(drawn, 'the N=0 control drew particles').toEqual(drawn.map(() => 0));
      } else {
        for (const d of drawn) {
          expect(d, `the N=${n} sweep point drew ${d} particles`).toBeGreaterThan(0);
        }
      }
    }

    // ── Guard 1: the statistic ORDERS its own mutation ─────────────────────────────────────────
    //
    // 🔴 Compared in CLOCK STEPS, not in raw doubles, and that is a correction the first run forced.
    // Every `workMedianMs` is a difference of two `performance.now()` readings, so it is an exact
    // multiple of `CLOCK_GRID_MS` carrying float dirt in the digits below it — and the first sweep
    // read a clean 0.600/0.600/0.600/0.700/0.800/1.100 while failing on `0.6000000089 >= 0.6000000119`.
    // A genuine one-step inversion still fails here; a tie the clock cannot resolve does not. See
    // `CLOCK_GRID_MS` for why the ties at the bottom of the table are the instrument and not the gate.
    const steps = sweepWork.map((ms) => Math.round(ms / CLOCK_GRID_MS));
    for (let i = 1; i < SWEEP_ALIVE.length; i += 1) {
      expect(
        steps[i]!,
        `${SWEEP_ALIVE[i]} particles measured CHEAPER than ${SWEEP_ALIVE[i - 1]} ` +
          `(${sweepWork[i]!.toFixed(3)} ms against ${sweepWork[i - 1]!.toFixed(3)} ms). A statistic ` +
          'that cannot order its own mutation is not fixed by moving a bound — it is replaced. See ' +
          `the sweep table above.${detail}`,
      ).toBeGreaterThanOrEqual(steps[i - 1]!);
    }

    // ── Guard 2: the amplifier amplified ───────────────────────────────────────────────────────
    //
    // `phase-08-gate-perf.spec.ts`'s premise check. Without it the per-particle figure is a delta of
    // noise over 1024, and every bound below would pass most comfortably for a build that drew none.
    expect(
      stormDelta,
      `${STORM_ALIVE} particles cost the frame ${stormDelta.toFixed(4)} ms more than none — the ` +
        'amplifier is not amplifying, so the per-particle figure is noise divided by a big number ' +
        `and this gate is measuring nothing.${detail}`,
    ).toBeGreaterThanOrEqual(MIN_STORM_WORK_DELTA_MS);

    // ── Guard 3: the divide-back is a measurement, not an extrapolation ────────────────────────
    //
    // Two independent estimates of one quantity at two amplifications. If the cost scales with the
    // number of particles they agree, and dividing the delta by the count is sound. If they do not,
    // the inference is broken and the reported per-particle number is fabricated.
    const spread =
      Math.max(perParticle, perParticleHalf) / Math.max(1e-9, Math.min(perParticle, perParticleHalf));
    expect(
      spread,
      `the per-particle cost at ${halfN} (${perParticleHalf.toFixed(5)} ms) and at ${STORM_ALIVE} ` +
        `(${perParticle.toFixed(5)} ms) disagree by ${spread.toFixed(1)}x. The cost does not scale ` +
        'with the count, so dividing by it is not a per-particle figure. Withdraw the divide-back ' +
        `rather than reporting an extrapolation through a region nothing measured.${detail}`,
    ).toBeLessThan(MAX_LINEARITY_SPREAD);

    // ── The budget ─────────────────────────────────────────────────────────────────────────────
    //
    // The absolute bound goes FIRST because it is criterion 9.5's own sentence — *the frame budget
    // holds under the worst case* — and Playwright reports the first failure. The two below refine
    // it: what the feature cost, and what one particle of it cost.
    expect(
      onWork,
      `the worst case — ${DEV_FLEET_COUNT} enemies and ${peak} particles — left the frame ` +
        `budget${detail}`,
    ).toBeLessThanOrEqual(MAX_EFFECT_FRAME_WORK_MS);
    expect(delta, `the shipped particle peak costs more than it should${detail}`).toBeLessThanOrEqual(
      MAX_EFFECT_WORK_DELTA_MS,
    );
    expect(perParticle, `one particle costs more per frame than it should${detail}`).toBeLessThanOrEqual(
      MAX_PER_PARTICLE_WORK_MS,
    );
  });
});
