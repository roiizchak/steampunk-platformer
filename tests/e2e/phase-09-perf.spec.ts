/**
 * # Phase 9, criterion 9.5 — the frame budget holds under the worst case.
 *
 * ## 9.6 is not optional scenery, it is inside this file
 *
 * *A frame budget that a blank screen passes is worse than no gate*, because a build that stopped
 * drawing gets FASTER and every millisecond assertion below gets easier. This project has shipped
 * that shape twice — twelve of twenty enemies as grey-box Rectangles with every gate green, and a
 * death fade that played a whole ten-frame KO at 35 % opacity while the sampler reported ten of ten
 * poses painted *(vault 9.4)*. `phase-09-draw.spec.ts` owns criterion 9.6, but this file does not
 * depend on that one having run: **Guard 0 and Guard 0b re-take the same statistic per arm**, on
 * particles and on the twenty enemies, before a single millisecond is compared here.
 *
 * ## The seam
 *
 * `effectBudget.ts` holds every constant and its derivation; `effectCounts.ts` the drawn counter and
 * the reading of one window; `effectMutation.ts` the committed mutations and the storm that drives
 * the real emitters. This file states the claims and asserts them, and nothing else.
 *
 * ## Every mutation is one shell variable — none has to be reinvented
 *
 * ```
 * PERF_MUTATION=storm8192   …  # the absolute frame budget
 * PERF_MUTATION=fleetscale0 …  # Guard 0b — the twenty enemies this test's headline names
 * PERF_MUTATION=scale0      …  # Guard 0 — the particles, by the emitter render gate
 * ```
 *
 * Anything else throws (`namedMutation`): a proof that silently ran clean would report a green
 * suite, which is the most convincing possible evidence that nothing was tested.
 *
 * ## ⚠️ Stated limits *(vault 9.3 — a gate's blind spots are part of its result)*
 *
 *  - **🔴 The measured frame carries NO COMBAT, and the absolute bound must be read that way.**
 *    `installStorm` holds the player invulnerable on every frame of every arm. It has to — without
 *    it the shipped effects path fires bursts that `atLimit()` accepts in cheap arms and DROPS in
 *    expensive ones, an inversion that stops the sweep ordering at all. The price is that the frame
 *    `MAX_EFFECT_FRAME_WORK_MS` is asserted on contains no `hurt` or `death` state, no hit-stop, no
 *    knockback, no screen shake, no i-frame flicker and none of `gameEffects.render()`'s own trigger
 *    paths. It is the worst **steady-state** frame, not the worst frame the game can produce.
 *  - **🔴 The storm holds a population; it does not measure a single triggered burst.**
 *    `sampleArm` waits for the population to land *before* sampling, so the frame that first
 *    constructs N particles is outside the window by construction. What is inside is the top-up —
 *    which is itself burst-shaped and not a trickle: `EmitterSpec.lifespanTicks` is a scalar, so an
 *    entire `explode()` expires on one frame and the whole cap is re-exploded on the next, every 18
 *    ticks for sparks, 45 for steam, 22 for dust, through the shipped call. Those spikes are what
 *    `MAX_EFFECT_FRAME_P95_MS` gates; every other bound here is a median and blind to them. The
 *    shipped *trigger* path — `impactSparks`, `deathSteam`, `hurtVent`, `landingDust` deciding
 *    **when** to burst — is criterion 9.1's behavioural spec, not this one.
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

import {
  CLOCK_GRID_MS,
  MAX_EFFECT_FRAME_P95_MS,
  MAX_EFFECT_FRAME_WORK_MS,
  MAX_EFFECT_WORK_DELTA_MS,
  MAX_LINEARITY_SPREAD,
  MAX_PER_PARTICLE_WORK_MS,
  MIN_HALF_STORM_WORK_DELTA_MS,
  MIN_STORM_WORK_DELTA_MS,
  PAIRS,
  SHIPPED_PEAK_ALIVE,
  STORM_ALIVE,
  SWEEP_ALIVE,
} from './effectBudget';
import { sampleArm, spawnWorstCaseFleet } from './effectCounts';
import {
  installStorm,
  namedMutation,
  setEmitterScale,
  setEnemyScale,
  setStorm,
  stormCount,
} from './effectMutation';
import { bootToGame } from './gameHarness';
import { median } from './levelPerf';
import { DEV_FLEET_COUNT } from './perfBudget';
import { counts } from './perfSampler';
import { assertRealGpu } from './realGpu';

declare const process: { env: Record<string, string | undefined> };

/** Throws on an unrecognised value rather than running clean and reporting green — see `L2`. */
const MUTATION = namedMutation(process.env.PERF_MUTATION ?? '');
const STORM_MUTATION = stormCount(process.env.PERF_MUTATION ?? '');

/** How many times the whole sweep is walked. Odd, so the median of each point is a real reading. */
const SWEEP_ROUNDS = 5;


test.describe('Phase 9 — criterion 9.5, the effect frame budget', () => {
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
    // 🔴 Both drawing mutations are applied HERE too, not only in the 9.6 test. Guard 0 below is
    // 9.6's statistic standing in front of this file's milliseconds, and a guard never run against
    // the mutation it exists for is decoration. Under `scale0` every window still holds its full
    // population, still reports it alive, and draws none of it — which makes each arm CHEAPER and
    // every bound below easier. Under `fleetscale0` the twenty enemies this test's headline
    // assertion NAMES go undrawn, which is the same defect one layer out.
    if (MUTATION === 'scale0') {
      await setEmitterScale(page, 0);
    }
    if (MUTATION === 'fleetscale0') {
      await setEnemyScale(page, 0);
    }

    // The enemy load, read once before sampling so the per-arm reads below have something to be
    // identical TO. `opaque` is `willRender`, not the creation-time `isSprite` flag.
    const fleet = await counts(page);

    // ── The sweep ──────────────────────────────────────────────────────────────────────────────
    const sweep = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
    const sweepDrawn = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
    for (let round = 0; round < SWEEP_ROUNDS; round += 1) {
      // Alternating direction, for `PAIRS`'s reason: a fixed walk order gives every low point a
      // colder machine than every high point, and that bias is exactly the shape the sweep looks for.
      const order = round % 2 === 0 ? [...SWEEP_ALIVE] : [...SWEEP_ALIVE].reverse();
      for (const n of order) {
        const arm = await sampleArm(page, n, `sweep N=${n}, round ${round}`, fleet);
        sweep.get(n)!.push(arm.measured.workMedianMs);
        sweepDrawn.get(n)!.push(arm.particles.drawn);
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
    const peak = STORM_MUTATION || SHIPPED_PEAK_ALIVE;
    type Arm = { work: number[]; p95: number[]; drawn: number[]; opaque: number[]; sprites: number[] };
    const blank = (): Arm => ({ work: [], p95: [], drawn: [], opaque: [], sprites: [] });
    const arms: Record<'on' | 'off', Arm> = { on: blank(), off: blank() };
    for (let pair = 0; pair < PAIRS; pair += 1) {
      const order = pair % 2 === 0 ? (['on', 'off'] as const) : (['off', 'on'] as const);
      for (const name of order) {
        const arm = await sampleArm(page, name === 'on' ? peak : 0, `arm ${name}, pair ${pair}`, fleet);
        arms[name].work.push(arm.measured.workMedianMs);
        arms[name].p95.push(arm.measured.workP95Ms);
        arms[name].drawn.push(arm.particles.drawn);
        // 🔴 The ENEMY drawn count, per arm. The assertion this test fails with names twenty
        // enemies; until this landed, nothing in it checked they were on screen while the windows
        // were taken. `sprites` is `isSprite`, a creation-time flag — `perfSampler.ts:137-141`
        // records it as standing blind spot T14 for exactly this reason — so it is kept only as the
        // "still Sprites, not Rectangles" half and `opaque` carries the drawn claim.
        arms[name].opaque.push(arm.enemies.opaque);
        arms[name].sprites.push(arm.enemies.sprites);
      }
    }
    await setStorm(page, 0);
    if (MUTATION === 'fleetscale0') {
      await setEnemyScale(page, 1);
    }

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
      `      enemies drawn on ${arms.on.opaque.join('/')} vs off ${arms.off.opaque.join('/')} ` +
        `(of ${fleet.bodies} bodies, ${fleet.sprites} sprites)`,
      `      p95 on ${fmt(arms.on.p95)} (bound ${MAX_EFFECT_FRAME_P95_MS})`,
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

    // ── Guard 0b: the twenty ENEMIES this test's headline assertion names were DRAWN ───────────
    //
    // Asserted inside `sampleArm`, at every window of every arm INCLUDING the sweep's, rather than
    // here — see its `drawnFleet` docstring for why (`opaque` is `willRender`; `sprites` is a
    // creation-time flag and blind spot T14). It is checked at the reading so the arm that lost the
    // fleet is the one named, twenty windows earlier than this line. `PERF_MUTATION=fleetscale0` is
    // its red proof, and the per-arm figures are printed above.
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

    // 🔴 And the SAME premise under the HALF amplification, which Guard 3 divides by.
    //
    // This is the tightest false-red route in the file and it used to be unguarded and undisclosed.
    // Guard 1 permits equality, so `sweepWork[512] === sweepWork[0]` is a legal clean outcome —
    // `perParticleHalf` is then 0, Guard 3's epsilon divisor takes over, and the spread reds at
    // ~5e5. Across seven clean sweeps the 512-vs-0 gap fell to two clock steps three times, against
    // five for the 1024 gap.
    //
    // ⚠️ **The message names QUANTISATION, not non-linearity, and that is the point of the guard.**
    // Failing through Guard 3 instead would tell the next reader "the cost does not scale, withdraw
    // the divide-back" — which under this project's rules sends them to REPLACE THE STATISTIC over
    // one step of `performance.now()` grid. That is the mistake the first sweep already made.
    const halfDelta = sweepWork[halfIndex]! - sweepWork[0]!;
    expect(
      halfDelta,
      `${halfN} particles measured ${halfDelta.toFixed(4)} ms above the control — under ` +
        `${MIN_HALF_STORM_WORK_DELTA_MS} ms, which is ${MIN_HALF_STORM_WORK_DELTA_MS / CLOCK_GRID_MS} ` +
        `steps of this browser's ${CLOCK_GRID_MS} ms clock. This is a RESOLUTION failure, not a ` +
        'linearity one: the half amplification did not clear the grid, so the per-particle estimate ' +
        'taken from it is quantisation noise and the linearity check below would divide by it. ' +
        'Raise the sweep points or the round count — do NOT conclude the cost is non-linear, and do ' +
        `NOT replace the statistic.${detail}`,
    ).toBeGreaterThanOrEqual(MIN_HALF_STORM_WORK_DELTA_MS);

    // ── Guard 3: the divide-back is a measurement, not an extrapolation ────────────────────────
    //
    // Two independent estimates of one quantity at two amplifications. If the cost scales with the
    // number of particles they agree, and dividing the delta by the count is sound. If they do not,
    // the inference is broken and the reported per-particle number is fabricated. Both inputs are
    // floored above the clock grid by the two guards above, so a failure HERE is a real disagreement
    // between two resolvable measurements rather than a division by noise.
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

    // ── The burst end of the window ────────────────────────────────────────────────────────────
    //
    // 🔴 Every bound above is a median, and two are medians of medians — a stall on one frame in
    // five hundred moves none of them. `workP95Ms` is in the same `Sample` precisely because
    // *"a median is by construction blind to a minority of expensive frames"*
    // (`perfSampler.ts:70-77`), and this gate had reproduced the omission it was added to fix: it
    // neither asserted nor printed it.
    //
    // The spikes are real and they are in the window. `EmitterSpec.lifespanTicks` is a scalar, so a
    // whole `explode()` expires on one frame and `installStorm` re-explodes the entire cap on the
    // next — a full-cap burst every 18 ticks for sparks, 45 for steam, 22 for dust, through the
    // shipped call. What the storm does NOT contain is the shipped TRIGGER deciding when to burst;
    // that is 9.1's spec, and the stated-limits block says so.
    //
    // The bound is `levelPerf.ts:71-84`'s and is deliberately NOT tuned to the observation: one
    // whole 60 Hz frame, because any single frame costing a whole frame is a defect whatever the
    // machine reads today. Every arm is asserted, not just the median of them — a percentile that
    // is medianed across pairs is a median again.
    for (let pair = 0; pair < PAIRS; pair += 1) {
      expect(
        arms.on.p95[pair],
        `pair ${pair}: the 95th-percentile frame of the effects-on window took ` +
          `${arms.on.p95[pair]!.toFixed(3)} ms — a whole 60 Hz frame. The medians above cannot see ` +
          `this by construction.${detail}`,
      ).toBeLessThanOrEqual(MAX_EFFECT_FRAME_P95_MS);
    }
  });
});
