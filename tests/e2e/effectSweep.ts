/**
 * The sweep — walking it, reducing it, and the **cost exponent** that is the whole licence for
 * criterion 9.5's divide-back.
 *
 * Split out of `phase-09-perf.spec.ts` in the 9.5 fix round, and the seam is the same one
 * `effectShake.ts` and `windowStall.ts` were cut on: the spec states the claims, each helper owns
 * one *precondition on a reading* and the fixture that breaks it. What is owned here is the shape of
 * the cost law, because that shape is what makes `perParticle` a measurement rather than an
 * extrapolation.
 *
 * ## 🔴 Why this file exists: the guard it replaces could not fire in the range it policed
 *
 * The previous licence was `MAX_LINEARITY_SPREAD = 4`, applied to two per-particle estimates taken at
 * `SWEEP_ALIVE`'s top two points — an amplification ratio of **2x**. Write the cost law as `c * N^k`.
 * Then per-particle cost is `c * N^(k-1)`, two estimates an amplification ratio `R` apart sit
 * `R^|k-1|` apart, and
 *
 * ```
 * spread < 4   with R = 2   ⟺   |k - 1| < 2   ⟺   -1 < k < 3
 * ```
 *
 * **So it passed for every cost law from O(1) to O(N^2.99)** — including the constant-cost case its
 * own failure message described (*"the cost does not scale with the count, so dividing by it is not a
 * per-particle figure"*), which lands at `spread = 2.0` and reads as healthy with margin to spare.
 * The clean spreads of 1.0-1.3 that were reported as evidence of linearity are `2^0.0` to `2^0.4`,
 * and every value up to `2^2` would have looked identical.
 *
 * The repo's rule is that **a statistic which cannot order its own mutation is replaced, not
 * re-bounded** — 6.9's GPU ratio is the precedent — so the number is not tightened here. What the
 * divide-back actually depends on is measured instead: the exponent.
 *
 * ## What the divide-back needs, stated as an asymmetry
 *
 * `perParticle` is `sweepDelta(0, STORM_ALIVE) / STORM_ALIVE` and is reported as the cost of ONE of
 * the shipped 96. Under `c * N^k` the per-particle cost is `c * N^(k-1)`, so:
 *
 * | | per-particle cost vs N | dividing an N=8192 delta back to 96 |
 * |---|---|---|
 * | `k > 1` | rises with N | **over**-states the shipped figure — conservative |
 * | `k = 1` | flat | exact |
 * | `k < 1` | falls with N | **under**-states it — the reported number is optimistic |
 *
 * That asymmetry is the band. The floor is load-bearing; there is deliberately no ceiling, and
 * `MIN_COST_EXPONENT` says why.
 */

import { expect } from '@playwright/test';

import { HALF_ALIVE, STORM_ALIVE, SWEEP_ALIVE } from './effectBudget';
import { sampleArm } from './effectCounts';
import { median, medianPairedDelta } from './levelPerf';

type Page = import('@playwright/test').Page;

/**
 * The floor on the measured cost exponent, and it is derived from the claim above plus the clock —
 * **no run had a vote in the value**.
 *
 * ## The claim
 *
 * The divide-back is conservative exactly while `k >= 1`. That is the number the gate wants.
 *
 * ## Why the floor is not exactly 1
 *
 * `k` is read from two sweep deltas, each a median of `SWEEP_ROUNDS` per-round differences of
 * `performance.now()` readings quantised to `CLOCK_GRID_MS = 0.1`. With the fit points `HALF_ALIVE`
 * and `STORM_ALIVE` an amplification ratio of 8 apart, one adverse clock step on the LOW delta
 * (~0.5 ms) is worth `ln(1 + 0.1/0.5) / ln(8)` = **0.088** of `k`; the same step on the high delta
 * (~6 ms) is worth 0.008 and does not matter. So the low point is the whole error budget, and 0.1
 * of `k` is one step of it.
 *
 * `MIN_COST_EXPONENT = 0.9` is `1` minus that one step, sized so the guard survives the **same
 * three-step adverse move of a median** that `MIN_STORM_WORK_DELTA_MS` and
 * `MIN_HALF_STORM_WORK_DELTA_MS` are set for: it fires only once the low delta reads about 0.93 ms,
 * against readings of 0.5-0.6.
 *
 * ⚠️ **The cost of the allowance is bounded ONLY IF the law really is `c * N^k`, and this paragraph
 * used to say so without the "if".** Under a power law, at the floor exactly, the divide-back from
 * 8192 to 96 under-states the shipped per-particle cost by `(8192/96)^0.1` = **1.56x**, against a
 * `MAX_PER_PARTICLE_WORK_MS` that sits ~4x above the reading — comfortable.
 *
 * Codex's Phase 9 implementation review (finding 5) pointed out that the renderer's cost is not a
 * pure power: `ParticleEmitterWebGLRenderer.js:66-70` early-returns on `particleCount === 0`, so a
 * non-empty population additionally pays a draw call, a bind and a flush that do not scale with `N`,
 * and the storm's `explode` is called per emitter only when the population is non-empty. That is an
 * **affine** cost, `a + bN`, and its algebra is right — re-derived here rather than taken on trust:
 *
 * ```
 * a = 0.2732 * 1024b   ->   k = ln((a/1024b + 8) / (a/1024b + 1)) / ln 8 = 0.9001
 * reported  d(8192)/8192 = 1.034b        true  d(96)/96 = 3.914b        ratio 3.79x
 * ```
 *
 * **So the 1.5x was a model-dependent number stated as an unconditional one.** At the same measured
 * `k = 0.9` an affine law under-states by **3.8x**, which is NOT covered by the ~4x headroom — the
 * argument in the paragraph above does not survive it.
 *
 * 🔴 **The floor and the fit are unchanged anyway, and the reason is the recorded data, not
 * convenience.** An affine law with `a >= 0` has `k -> 1` as `a -> 0` and `k < 1` for every `a > 0`:
 * **`k = 1` is the affine family's ceiling.** Every one of the seven recorded sweeps measured
 * `k = 1.086 - 1.286` — *super*-linear, outside that family entirely — and fitting `a + bN` through
 * those two points returns a **negative** intercept (-0.16 to -0.37 ms), which makes `(a + 96b)/96`
 * negative and the "true shipped figure" meaningless. Two points cannot identify a three-parameter
 * reality, so swapping this fit for an affine one would replace a model that is wrong in a known
 * direction with one that does not fit the measurements at all.
 *
 * What is left is a **disclosed band, not a covered one**: for `0.9 <= k < 1` — sub-linear, which no
 * run has ever produced — the divide-back under-states by somewhere between 1x and 3.8x, and only
 * the low end of that is inside the headroom. The floor is what catches a run that leaves the
 * conservative regime; it is not a proof of how bad the regime it admits can be. QA log entry 47.
 *
 * ## 🔴 There is NO ceiling, and that is a decision rather than an omission
 *
 * A super-linear cost law makes the divide-back *pessimistic*, which is the safe direction, and it is
 * already gated: an exponent large enough to matter inflates `perParticle` into
 * `MAX_PER_PARTICLE_WORK_MS`, which fails. A ceiling would also be **decoration under this repo's own
 * rule (C2)**: to drive `k` to 1.5 on this harness a fixture has to add ~11 ms to the 8192 frame, and
 * a frame that expensive serves fewer animation frames than the window has sim ticks — so
 * `sampleArm`'s *"the machine did not keep up with the simulation"* precondition fires first and the
 * ceiling can never be watched failing. A bound that cannot go red is not shipped here.
 */
export const MIN_COST_EXPONENT = 0.9;

/**
 * The cost exponent `k` in `work(N) = c * N^k`, from two measured points.
 *
 * Pure, and taken from the **widest** span the sweep resolves: the closer the low fit point is to the
 * shipped 96, the less of the divide-back is inference. Both inputs are floored above the clock grid
 * by the two premise guards before this is called, so a returned `k` is a ratio of two resolvable
 * measurements rather than a ratio of noise.
 */
export function costExponent(nLow: number, deltaLow: number, nHigh: number, deltaHigh: number): number {
  return Math.log(deltaHigh / deltaLow) / Math.log(nHigh / nLow);
}

/**
 * The **cost-law fixture**: `PERF_MUTATION=flatcost`, a per-frame cost that does not depend on the
 * particle count. `exponent` 0 is the constant-cost case.
 *
 * 🔴 **This is the mutation the exponent assertion NAMES, not a convenient one.** The particles are
 * untouched — every one still emitted, alive, drawn and counted, every arm still ordering, both
 * premise floors still cleared — and the only thing that changes is that the frame's cost stops
 * scaling with them. That is precisely the state in which dividing a delta by a count fabricates a
 * per-particle figure.
 *
 * ⚠️ **The guard it replaces passes this fixture, and that is the point of committing it.** With
 * `FIXTURE_COST_MS` on top of the real deltas the two per-particle estimates land ~2x apart, under
 * the old `MAX_LINEARITY_SPREAD = 4` — at the old 2x amplification ratio *and* at the widened one.
 * So the defect was the statistic, not the ratio, and this fixture is the proof of that rather than
 * an argument for it.
 *
 * It burns real main-thread milliseconds in its own `requestAnimationFrame`, registered after
 * `installStorm`'s and therefore before the sampler's — `perfSampler.sample()` measures
 * `performance.now() - frameStart` from rAF's own argument, so everything the frame has already done
 * is inside the reading. It reads the live storm caps rather than a remembered count, so the arm it
 * charges is whatever arm is actually running.
 */
export async function installCostLawFixture(page: Page, exponent: number): Promise<void> {
  await page.evaluate(
    ({ p, costMs, unit }: { p: number; costMs: number; unit: number }) => {
      const w = window as unknown as { __fxStorm?: { caps: Record<string, number> } };
      if (w.__fxStorm === undefined) {
        throw new Error('installCostLawFixture before installStorm — there are no caps to read');
      }
      const storm = w.__fxStorm;
      const step = (): void => {
        let alive = 0;
        for (const cap of Object.values(storm.caps)) {
          alive += cap;
        }
        if (alive > 0) {
          const until = performance.now() + costMs * Math.pow(alive / unit, p);
          while (performance.now() < until) {
            /* burn the main thread, exactly where the particles' own cost lands */
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    { p: exponent, costMs: FIXTURE_COST_MS, unit: HALF_ALIVE },
  );
}

/**
 * What the fixture burns at `N = HALF_ALIVE`. Three times the real 1024-particle delta and a fifth of
 * the real 8192 one, which is what flattens the law without stalling the window: the 8192 frame stays
 * near 8 ms, well inside the one-animation-frame-per-sim-tick precondition `sampleArm` enforces.
 */
const FIXTURE_COST_MS = 1.5;

/** One walk of `SWEEP_ALIVE`, reduced. `delta` is the per-round paired delta, never a difference of medians. */
export interface SweepReading {
  /** Median `workMedianMs` at each point of `SWEEP_ALIVE`, in that order. */
  work: number[];
  /** Every round's drawn-particle count at each point — Guard 0b's input. */
  drawn: Map<number, number[]>;
  /** Median of the per-round deltas between two points. */
  delta: (from: number, to: number) => number;
  /** The printable table, one row per point. */
  table: string[];
}

/**
 * Walk `SWEEP_ALIVE` `rounds` times, alternating direction, and reduce.
 *
 * Alternating for `PAIRS`'s reason: a fixed walk order gives every low point a colder machine than
 * every high point, and that bias is exactly the shape the sweep looks for.
 *
 * 🔴 Every delta is the **median of the per-round deltas**, never the delta of two medians. Adjacent
 * points are visited adjacently in time, so a per-round subtraction cancels the drift between rounds
 * that a difference of medians keeps — `levelPerf.ts`'s `medianPairedDelta`, the correction the
 * spec's own `PAIRS` docstring cites and the sweep used to ignore.
 */
export async function walkSweep(
  page: Page,
  rounds: number,
  fleet: { bodies: number; sprites: number },
  shakes: number[],
): Promise<SweepReading> {
  const work = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
  const drawn = new Map<number, number[]>(SWEEP_ALIVE.map((n) => [n, []]));
  for (let round = 0; round < rounds; round += 1) {
    const order = round % 2 === 0 ? [...SWEEP_ALIVE] : [...SWEEP_ALIVE].reverse();
    for (const n of order) {
      const arm = await sampleArm(page, n, `sweep N=${n}, round ${round}`, fleet);
      work.get(n)!.push(arm.measured.workMedianMs);
      drawn.get(n)!.push(arm.particles.drawn);
      shakes.push(arm.shake);
    }
  }
  const medians = SWEEP_ALIVE.map((n) => median(work.get(n)!));
  return {
    work: medians,
    drawn,
    delta: (from, to) => medianPairedDelta(work.get(from)!, work.get(to)!),
    table: SWEEP_ALIVE.map(
      (n, i) =>
        `N=${String(n).padStart(4)}  work ${medians[i]!.toFixed(3)} ms  ` +
        `(runs ${work.get(n)!.map((v) => v.toFixed(3)).join('/')}; drawn ${drawn.get(n)!.join('/')})`,
    ),
  };
}

/**
 * Guard 0b's half of the sweep: every non-zero point drew particles, and the control drew none.
 *
 * Here rather than in the spec because it is a precondition on a READING, and because the reading it
 * qualifies is produced here. The pairs' copy stays in the spec, where the pairs are.
 */
export function assertSweepDrew(reading: SweepReading): void {
  for (const n of SWEEP_ALIVE) {
    const drawn = reading.drawn.get(n)!;
    if (n === 0) {
      expect(drawn, 'the N=0 control drew particles').toEqual(drawn.map(() => 0));
    } else {
      for (const d of drawn) {
        expect(d, `the N=${n} sweep point drew ${d} particles`).toBeGreaterThan(0);
      }
    }
  }
}

/** The two fit points, exported so the spec's message and this file's derivation cannot drift apart. */
export const FIT_POINTS = { low: HALF_ALIVE, high: STORM_ALIVE } as const;
