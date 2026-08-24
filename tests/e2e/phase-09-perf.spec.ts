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
 * depend on that one having run: **Guard 0 and Guard 0b re-take a drawn count per arm**, on
 * particles and on the twenty enemies, before a single millisecond is compared here.
 *
 * 🔴 **One of 9.6's three particle checks, not three.** `sampleArm` re-takes `particleCounts().drawn`
 * and `counts().opaque`; it does **not** re-take `emittersDrawing`, `inCameraList` or `inView`. The
 * named regression `inCameraList` exists for — `scene.add.particles` → `scene.make.particles`, which
 * leaves the emitter on no display list while `willRender` still returns true — has no copy here. It
 * is INFERRED (not watched) that it would still red this file, through the premise floor rather than
 * through Guard 0: off the update list the particles stop ageing, the sweep goes flat and the 0.2 ms
 * gap fires. Inferred is written down as inferred.
 *
 * ## The seam
 *
 * `effectBudget.ts` holds every constant and its derivation; `effectCounts.ts` the drawn counter and
 * the reading of one window; `effectMutation.ts` the committed mutations and the storm that drives
 * the real emitters; `effectShake.ts` the third load and its counter; `windowStall.ts` the deadline
 * that stops a stopped simulation presenting as a hang. This file states the claims and asserts them.
 *
 * ## Every mutation is one shell variable — none has to be reinvented
 *
 * ```
 * PERF_MUTATION=storm8192     …  # the absolute frame budget
 * PERF_MUTATION=fleetscale0   …  # Guard 0b — the twenty enemies this test's headline names
 * PERF_MUTATION=scale0        …  # Guard 0 — the particles, by the emitter render gate
 * PERF_MUTATION=particlescale0…  # Guard 0 — the particles, by the PER-PARTICLE gate `scale0` misses
 * PERF_MUTATION=noshake       …  # Guard 0c — the SHAKE, the third load 9.5's sentence names
 * PERF_MUTATION=flatcost      …  # Guard 3 — a frame cost that does not scale with the count
 * PERF_MUTATION=stall         …  # the window's deadline, in place of a ten-minute hang
 * ```
 *
 * 🔴 **`particlescale0` was registered and applied NOWHERE in this file**, so it ran clean and
 * reported `1 passed` — one of the six names producing exactly the outcome the paragraph below calls
 * impossible, and it meant Guard 0 had never been watched failing against the per-particle branch at
 * all. Registering a mutation is not wiring one.
 *
 * Anything else throws (`namedMutation`): a proof that silently ran clean would report a green
 * suite, which is the most convincing possible evidence that nothing was tested.
 *
 * ## ⚠️ Stated limits *(vault 9.3 — a gate's blind spots are part of its result)*
 *
 * 🔴 **Each one's full text is a numbered §9.8 entry in `docs/qa/phase-09-polish.md`** — the home
 * criterion 9.8 designates, and where the gate round's `performance-engineer` brief found the shake
 * half of this list MISSING (finding M2). Summarised here so one narrowing has one authority.
 *
 *  - **🔴 NO COMBAT is in the measured frame** — `installStorm` holds the player invulnerable in
 *    every arm, or `atLimit()` accepts a burst in a cheap arm and drops it in an expensive one and
 *    the sweep inverts. Worst **steady-state** frame, not the worst. *(entry 43)*
 *  - **🔴 The shake IS in it, and it did not use to be** — `effectShake.ts` drives one through the
 *    shipped `land` path, the one arming route with no burst in it, and Guard 0c fails a window that
 *    did not carry it. `land` is the smallest of the four commands. *(entry 44)*
 *  - **🔴 A held population, not one triggered burst** — though the top-up is itself burst-shaped and
 *    `MAX_EFFECT_FRAME_P95_MS` gates the spikes every median here is blind to. *(entry 45)*
 *  - **"Max enemies" is the largest fleet this project MEASURES** — S5, still open. *(entry 6)*
 *  - **96 particles sit below this browser's clock grid** — the amplified storm is measured and
 *    divided back. That is conservative while the cost exponent is at least 1, and Guard 3 measures
 *    the exponent. It used to say *"legal only while linear, and the spec asserts the linearity"*,
 *    and the spec asserted no such thing — see Guard 3. *(entry 5)*
 *  - **🔴 The level, the HUD and the player sprite are in the frame and nothing checks they are** —
 *    only the enemies, the particles and the shake are re-taken per arm, and all three unchecked
 *    loads make the absolute bound EASIER when absent. *(entry 46)*
 *  - **No GPU timer, deliberately** — a main-thread cost, so a GPU ratio is the wrong instrument
 *    (6.9's history), and the timer would add work to this file's own absolute bound.
 *  - **An absolute millisecond from this harness is not one from a player's machine.** The renderer
 *    is asserted and printed for exactly that reason.
 */

import { expect, test } from '@playwright/test';

import {
  CLOCK_GRID_MS,
  HALF_ALIVE,
  MAX_EFFECT_FRAME_P95_MS,
  MAX_EFFECT_FRAME_WORK_MS,
  MAX_EFFECT_WORK_DELTA_MS,
  MAX_PER_PARTICLE_WORK_MS,
  MIN_HALF_STORM_WORK_DELTA_MS,
  MIN_STORM_WORK_DELTA_MS,
  PAIRS,
  SHIPPED_PEAK_ALIVE,
  STORM_ALIVE,
  SWEEP_ALIVE,
} from './effectBudget';
import { spawnWorstCaseFleet, walkPairs } from './effectCounts';
import { installStorm, namedMutation, setEnemyScale, setStorm, stormCount } from './effectMutation';
import { MIN_COST_EXPONENT, assertSweepDrew, costExponent, walkSweep } from './effectSweep';
import { DRIVEN_SHAKE, MIN_SHAKEN_FRAME_FRACTION, installShakeDrive } from './effectShake';
import { bootToGame } from './gameHarness';
import { median } from './levelPerf';
import { DEV_FLEET_COUNT } from './perfBudget';
import { counts } from './perfSampler';
import { assertRealGpu } from './realGpu';
import { applyPerfMutation } from './perfMutationSetup';

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
   * ### The sweep is what earns the bound, and the pairs are what make it trustworthy
   *
   * `walkSweep` walks `SWEEP_ALIVE` `SWEEP_ROUNDS` times and the cost must be **monotone
   * non-decreasing in N** before any threshold is applied to any of it — this gate does not exist
   * until it orders. `walkPairs` takes ten AB/BA pairs at the shipped peak, in the same page, seconds
   * apart. Both reduce to the **median of the per-round or per-pair deltas** rather than a delta of
   * medians; both alternate direction. `effectSweep.ts` and `effectCounts.ts` carry the evidence for
   * each of those three choices, and `SWEEP_ALIVE`'s docstring has the six runs that ordered 1/6 the
   * other way.
   */
  // 🔴 **Premises are `expect`, the four upper bounds are `expect.soft`** (2026-08-24, debt §1b).
  //
  // Playwright stops a test at the first hard failure, so before this change the four bounds were
  // evaluated in *write order*: `onWork` red meant `delta`, `perParticle` and every pair's `p95` were
  // never reached, and a run reported one bound when three were out. Soft-failing them makes each
  // reachable — you now hear about all four in one run instead of the first one written down.
  //
  // ⚠️ **That buys REACHABILITY, not independence.** The four are algebraically coupled:
  // `delta = onWork - offWork`, and `perParticle` divides `delta`. One real cost increase moves
  // three of them, and no mutation can isolate `delta` or `perParticle` from `onWork` — recorded as
  // a finding in `docs/qa/session-phase-09-debts-02-perf.md` §Batch 6 rather than papered over. The `p95`
  // bound is the exception, because it is the only one of the four that is not a median:
  // `PERF_MUTATION=p95spike` reddens it and leaves all three medians where they were.
  //
  // 🔴 **Everything above the budget block stays HARD, and Guard 2 most of all.** `MIN_STORM_WORK_
  // DELTA_MS` is the amplifier premise: soft-fail it and execution runs on into the `exponent` and
  // `perParticle` assertions whose meaning it licenses — a delta of noise over 1024, reported as a
  // measurement. Same for Guards 0/0b/0c, Guard 1's monotonicity, Guard 3's cost law, the real-GPU
  // check and the window-close guard. A premise that does not stop the test is not a premise.
  test('the worst case stays inside the frame budget, and the cost rises with the particle count', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await bootToGame(page);
    const renderer = await assertRealGpu(page, '9.5');
    await installStorm(page);
    // 🔴 Criterion 9.5's THIRD load. `installStorm` makes combat impossible on purpose, which took
    // the shake out of every window this gate ever took. `noshake` is Guard 0c's red proof.
    await installShakeDrive(page, MUTATION !== 'noshake');
    await spawnWorstCaseFleet(page);
    await applyPerfMutation(page, MUTATION);

    // The enemy load, read once before sampling so the per-arm reads below have something to be
    // identical TO. `opaque` is `willRender`, not the creation-time `isSprite` flag.
    const fleet = await counts(page);

    // ── The sweep ──────────────────────────────────────────────────────────────────────────────
    //
    // Walked, reduced and tabulated by `effectSweep.ts`, which also owns what its shape licenses.
    // Every gap below is the MEDIAN OF THE PER-ROUND DELTAS, never the delta of two medians.
    const shakes: number[] = []; // every window's shaken-frame fraction; Guard 0c asserts each one
    const sweep = await walkSweep(page, SWEEP_ROUNDS, fleet, shakes);
    const sweepDelta = sweep.delta;

    // ── The pairs, at the shipped peak ─────────────────────────────────────────────────────────
    const peak = STORM_MUTATION || SHIPPED_PEAK_ALIVE;
    const arms = await walkPairs(page, PAIRS, peak, fleet, shakes);
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
    // Divided back from the TOP of the sweep on purpose — at the exponents this measures, the higher
    // the amplification the more the figure over-states the shipped one, which is the safe direction.
    const stormDelta = sweepDelta(0, STORM_ALIVE);
    const halfDelta = sweepDelta(0, HALF_ALIVE);
    const perParticle = Math.max(0, stormDelta / STORM_ALIVE);
    const exponent = costExponent(HALF_ALIVE, halfDelta, STORM_ALIVE, stormDelta);

    const fmt = (v: number[]): string => v.map((x) => x.toFixed(3)).join('/');
    const detail = [
      '',
      `[9.5] renderer ${renderer}`,
      ...sweep.table.map((row) => `      ${row}`),
      `      sweep gaps (median of per-round deltas) ` +
        SWEEP_ALIVE.slice(1)
          .map((n, i) => `${SWEEP_ALIVE[i]}->${n} ${sweepDelta(SWEEP_ALIVE[i]!, n).toFixed(3)} ms`)
          .join(', '),
      `      peak ${peak} on ${fmt(arms.on.work)}`,
      `      peak ${peak} off ${fmt(arms.off.work)}`,
      `      pair deltas ${fmt(pairDeltas)}`,
      `      drawn on ${arms.on.drawn.join('/')} vs off ${arms.off.drawn.join('/')}`,
      `      shaken frames ${(Math.min(...shakes) * 100).toFixed(1)}-${(Math.max(...shakes) * 100).toFixed(1)} % ` +
        `over ${shakes.length} windows (floor ${MIN_SHAKEN_FRAME_FRACTION * 100} %, ${DRIVEN_SHAKE.durationTicks}-tick land shake)`,
      `      enemies drawn on ${arms.on.opaque.join('/')} vs off ${arms.off.opaque.join('/')} ` +
        `(of ${fleet.bodies} bodies, ${fleet.sprites} sprites)`,
      `      p95 on ${fmt(arms.on.p95)} (bound ${MAX_EFFECT_FRAME_P95_MS})`,
      `      median work on ${onWork.toFixed(3)} ms, off ${offWork.toFixed(3)} ms, ` +
        `paired delta ${delta.toFixed(4)} ms (bound ${MAX_EFFECT_WORK_DELTA_MS})`,
      `      absolute ${onWork.toFixed(3)} ms (bound ${MAX_EFFECT_FRAME_WORK_MS})`,
      `      per particle ${perParticle.toFixed(5)} ms at ${STORM_ALIVE} ` +
        `(bound ${MAX_PER_PARTICLE_WORK_MS})`,
      `      cost exponent k ${exponent.toFixed(3)} from ${halfDelta.toFixed(3)} ms at ${HALF_ALIVE} ` +
        `and ${stormDelta.toFixed(3)} ms at ${STORM_ALIVE} (floor ${MIN_COST_EXPONENT})`,
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
    assertSweepDrew(sweep);

    // ── Guard 1: the statistic ORDERS its own mutation ─────────────────────────────────────────
    //
    // 🔴 Rounded to CLOCK STEPS, not compared as raw doubles: every `workMedianMs` is a difference of
    // two `performance.now()` readings, an exact multiple of `CLOCK_GRID_MS` carrying float dirt
    // below it, and the first sweep failed on `0.6000000089 >= 0.6000000119`. A genuine one-step
    // inversion still fails; a tie the clock cannot resolve does not.
    for (let i = 1; i < SWEEP_ALIVE.length; i += 1) {
      const gap = sweepDelta(SWEEP_ALIVE[i - 1]!, SWEEP_ALIVE[i]!);
      expect(
        Math.round(gap / CLOCK_GRID_MS),
        `${SWEEP_ALIVE[i]} particles measured CHEAPER than ${SWEEP_ALIVE[i - 1]} ` +
          `(${gap.toFixed(3)} ms per-round paired delta). A statistic that cannot order its own ` +
          'mutation is not fixed by moving a bound — it is replaced. See the sweep table above, and ' +
          `SWEEP_ALIVE's docstring for the gap widths this instrument can and cannot resolve.${detail}`,
      ).toBeGreaterThanOrEqual(0);
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
    // Guard 1 permits equality, so a half gap of exactly zero is a legal clean outcome —
    // `perParticleHalf` is then 0, Guard 3's epsilon divisor takes over, and the spread reds at ~5e5.
    //
    // 🔴 Its own advice — *raise the sweep points* — is what was taken. At the old half point of 512
    // this bound sat 1-3 clock steps from the reading and red 1 run in 6 the moment Guard 1 stopped
    // firing first, which is a false red hiding behind another false red. `halfN` is 1024 now.
    //
    // ⚠️ **The message names QUANTISATION, not non-linearity, and that is the point of the guard.**
    // Failing through Guard 3 instead would tell the next reader "the cost does not scale, withdraw
    // the divide-back" — which under this project's rules sends them to REPLACE THE STATISTIC over
    // one step of `performance.now()` grid. That is the mistake the first sweep already made.
    expect(
      halfDelta,
      `${HALF_ALIVE} particles measured ${halfDelta.toFixed(4)} ms above the control — under ` +
        `${MIN_HALF_STORM_WORK_DELTA_MS} ms, which is ${MIN_HALF_STORM_WORK_DELTA_MS / CLOCK_GRID_MS} ` +
        `steps of this browser's ${CLOCK_GRID_MS} ms clock. This is a RESOLUTION failure, not a ` +
        'linearity one: the half amplification did not clear the grid, so the per-particle estimate ' +
        'taken from it is quantisation noise and the linearity check below would divide by it. ' +
        'Raise the sweep points or the round count — do NOT conclude the cost is non-linear, and do ' +
        `NOT replace the statistic.${detail}`,
    ).toBeGreaterThanOrEqual(MIN_HALF_STORM_WORK_DELTA_MS);

    // ── Guard 3: the cost EXPONENT, which is what the divide-back actually depends on ──────────
    //
    // 🔴 This replaces a bound on a derived *spread* that could not fire in the range it policed.
    // `spread = R^|k-1|` over an amplification ratio `R`, so `spread < 4` at `R = 2` was satisfied by
    // every cost law from O(1) to O(N^2.99) — including the constant-cost frame its own message
    // described. The rule here is that a statistic which cannot order its own mutation is REPLACED
    // rather than re-bounded, so the exponent is measured directly and the ratio widened to 8x to
    // resolve it. `effectSweep.ts` carries the algebra, the error budget and the fixture.
    //
    // The claim, and it is an asymmetric one: per-particle cost is `c * N^(k-1)`, so dividing the
    // 8192-particle delta back to 96 OVER-states the shipped cost at `k > 1` and UNDER-states it at
    // `k < 1`. Only the under-statement is dangerous, so only the floor is asserted — the reason
    // there is deliberately no ceiling is on `MIN_COST_EXPONENT`, and it is that no fixture can drive
    // one red on this harness without stalling the window first.
    //
    // Both inputs are floored above the clock grid by the two guards above, so a failure HERE is a
    // real cost law rather than a ratio of two quantisation steps. `PERF_MUTATION=flatcost` is its
    // red proof, and the guard it replaces PASSES that fixture.
    expect(
      exponent,
      `the cost grows as N^${exponent.toFixed(3)} between ${HALF_ALIVE} particles ` +
        `(${halfDelta.toFixed(3)} ms) and ${STORM_ALIVE} (${stormDelta.toFixed(3)} ms). Below ` +
        `N^1 the per-particle cost FALLS as the count rises, so dividing the ${STORM_ALIVE}-particle ` +
        `delta back to ${SHIPPED_PEAK_ALIVE} reports less than the shipped particles really cost. ` +
        'Withdraw the divide-back rather than reporting an extrapolation through a region nothing ' +
        `measured — do not move this floor.${detail}`,
    ).toBeGreaterThanOrEqual(MIN_COST_EXPONENT);

    // ── The budget ─────────────────────────────────────────────────────────────────────────────
    //
    // The absolute bound goes FIRST because it is criterion 9.5's own sentence — *the frame budget
    // holds under the worst case* — and Playwright reports the first failure. The two below refine
    // it: what the feature cost, and what one particle of it cost.
    expect.soft(
      onWork,
      `the worst case — ${DEV_FLEET_COUNT} enemies and ${peak} particles — left the frame ` +
        `budget${detail}`,
    ).toBeLessThanOrEqual(MAX_EFFECT_FRAME_WORK_MS);
    expect.soft(delta, `the shipped particle peak costs more than it should${detail}`).toBeLessThanOrEqual(
      MAX_EFFECT_WORK_DELTA_MS,
    );
    expect.soft(perParticle, `one particle costs more per frame than it should${detail}`).toBeLessThanOrEqual(
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
      expect.soft(
        arms.on.p95[pair],
        `pair ${pair}: the 95th-percentile frame of the effects-on window took ` +
          `${arms.on.p95[pair]!.toFixed(3)} ms — a whole 60 Hz frame. The medians above cannot see ` +
          `this by construction.${detail}`,
      ).toBeLessThanOrEqual(MAX_EFFECT_FRAME_P95_MS);
    }
  });
});
