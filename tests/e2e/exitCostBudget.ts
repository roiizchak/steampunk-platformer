/**
 * **What criterion G.7b's answer is allowed to be** — every number the exit's frame cost is judged
 * against, why each one has the value it has, and the fixture that proves the statistic can go red.
 *
 * Split from `phase-08-gate-perf.spec.ts` on 2026-08-22 when the repair below took that file over
 * the 400-line rule. The seam is the one this suite already uses twice: the spec states **what** the
 * criterion asks, `perfSampler.ts` is **how** a frame is measured, and a `*Budget.ts` file is **what
 * the answer is allowed to be** — `perfBudget.ts` for 5.11, `effectBudget.ts` for 9.5, this for
 * G.7b.
 *
 * ---
 *
 * ## 🔴 2026-08-22 — the linearity guard was flaky, and it was the FOURTH time in this shape
 *
 * The gate red about 3 runs in 8, on `main` and on the phase branch alike, with both arms printing
 * `0.0000 ms` and a spread of anything from 1.5x to 1510x. The guard was:
 *
 * ```
 *   perExitGpu     = (median(gpu @ 41 exits) - median(gpu @ 1 exit)) / 40
 *   perExitGpuHalf = (median(gpu @ 21 exits) - median(gpu @ 1 exit)) / 20
 *   spread         = max / min  <  4
 * ```
 *
 * Three defects, and the project had already paid for the first two:
 *
 *  1. **Unpaired medians of a within-noise effect** — criterion 6.9's discarded GPU ratio, 5.11 and
 *     9.5's Guard 1 are the other three sightings. Each arm's median is taken minutes from the
 *     other's, so the subtraction carries whatever the machine did in between. Measured here at 40
 *     copies, six rounds: per-round paired deltas **0.924 / 0.063 / 0.063 / −0.071 / 0.146 /
 *     0.164 ms**. One round in six read the amplifier as *cheaper* than the control. The
 *     reproduction run printed *21 exits* at **0.145 ms** against *1 exit* at **0.166 ms**.
 *  2. **`spread < 4` at an amplification ratio of 2 cannot fire in the range it polices.** Under a
 *     cost law `c·N^k` the spread is `R^|k−1|`, so at `R = 2` every law from `O(1)` to `O(N^2.99)`
 *     satisfies it — including the constant-cost frame its own message described. Criterion 9.5
 *     retired the identical statistic for the identical reason.
 *  3. **The amplifier destroyed and re-created the whole stack between arms.** Up to 2560
 *     allocations and their collection landed immediately before, and often inside, the window being
 *     measured. `setExitCopies` now builds the pool once and toggles `visible`, and the difference
 *     is not subtle: on an unchanged tree the two selection runs taken with the old amplifier
 *     disagreed about the cost of 2560 copies by **2x** (1.6 ms against 3.6 ms), while the pooled
 *     amplifier's per-round GPU deltas at 5120 read **2.470 / 2.468 / 2.463 ms**.
 *
 * ## The repair: pair the rounds, widen the arms, and stop dividing by the count
 *
 * 9.5's two ingredients both apply. **Pair the rounds** — `medianPairedDelta`, never a difference of
 * two medians. **Separate the arms until the effect clears the grid** — the sweep runs to
 * `SWEEP_COPIES` instead of 40, and every reading below is a whole millisecond rather than one step
 * of a 0.1 ms clock.
 *
 * What did **not** transfer is 9.5's cost EXPONENT, and that is a measurement rather than a
 * preference. Fitted on this gate's readings `k` swung **0.50, 0.84, 1.00, 1.52** across four runs
 * of an unchanged tree, on the main-thread and the GPU arm alike, because it is a ratio of two
 * differences and the smaller one is only a few clock steps wide however far the arms are separated.
 * A floor tight enough to mean anything false-reds; a floor loose enough to survive means nothing.
 * **A statistic that cannot order its own mutation is replaced, not re-bounded** — so it was, twice
 * in one session, and this is the second replacement.
 *
 * ## What the sweep actually showed, and the statistic that came out of it
 *
 * Paired deltas against the 1-exit control, pooled amplifier:
 *
 * | copies | 640 | 1280 | 2560 | 5120 |
 * |---|---|---|---|---|
 * | gpu | 0.888 | 1.176 | 1.468 | 2.468 ms |
 * | work | 0.000 | 0.400 | 1.200 | 3.300 ms |
 *
 * The GPU column is not proportional to the count and never was: making *any* copies visible costs
 * about **0.5 ms** on its own — a render-state and batch cost of splitting the scene at depth 7 —
 * and only the rest scales. Dividing a total delta by the count therefore attributes that fixed
 * half-millisecond to individual exits, which is exactly Codex's Phase 8 finding 3 ("a MARGINAL
 * cost, not a total one") arriving as a measurement instead of an objection.
 *
 * 🔴 **So the gate reports the MARGINAL cost and the fixed part cancels.** `perExit` is the gap
 * between the top two sweep points divided by the copies added between them, not the top delta
 * divided by the top count. A count-independent cost — the classic way a divide-back fabricates a
 * per-exit figure — appears in both points equally and subtracts out, so the statistic is immune to
 * it rather than guarded against it. What remains to assert is that the delta **responds to the
 * count at all**, which is `MIN_SWEEP_GAP_GPU_MS` / `MIN_SWEEP_GAP_WORK_MS`, and
 * `PERF_MUTATION=capdraw` is the mutation those name.
 */

type Page = import('@playwright/test').Page;

/**
 * Interleaved rounds. Matches 8.7's `PAIRS`, and 8.7 went 3 → 4 on 2026-08-25 for a reason that
 * applies here verbatim: an ODD number of alternating AB/BA blocks leaves one order occurring twice,
 * so under steady drift the per-round deltas are `+d, −d, +d` and their median is `+d` — the order
 * bias survives the pairing. Three is enough to median over and is not enough to balance the order.
 * Named by the Codex implementation review of the 2026-08-25 session.
 */
export const ROUNDS = 4;

/**
 * The amplification sweep, in extra exits stacked on the real one.
 *
 * 🔴 **The amplification IS the mutation the ceilings name** — same texture, same size, same depth,
 * same position. Nothing about the sim, the tilemap or the cull changes, so if the gap moves, the
 * only thing that moved is how much exit got drawn, and an exit twice as expensive to draw doubles
 * the marginal cost the spec reports.
 *
 * Three points, and each is load-bearing. **0** is the control every delta is paired against. **2560
 * and 5120** are the two the marginal cost is read between: both produce whole-millisecond deltas on
 * both arms, which is what the 40/20 pair could never do, and 5120 still serves ~700 frames in a
 * `SAMPLE_TICKS` window against a `MIN_SAMPLES` of 60. Intermediate points were measured and
 * dropped — 640 and 1280 read within a clock step of each other on the main thread, so a gap between
 * them is a bound on quantisation noise.
 */
export const SWEEP_COPIES = [0, 2560, 5120] as const;

/** The control, and the arm every delta is taken against. */
export const BASE_COPIES = SWEEP_COPIES[0];

/** The two points the marginal per-exit cost is read between. */
export const FIT_MID = SWEEP_COPIES[1];
export const FIT_HIGH = SWEEP_COPIES[2];

/** How many exits the top gap adds — the divisor that turns it into a per-exit cost. */
export const MARGINAL_COPIES = FIT_HIGH - FIT_MID;

/**
 * How many spare exits the amplifier pre-creates, once, before any window is sampled.
 *
 * The arms then differ only by `visible`, so no arm pays for allocating or collecting an image and
 * every arm walks the same display list. Defect 3 in this file's header is what that cost when it
 * was not so.
 */
export const POOL_COPIES = FIT_HIGH;

/**
 * The ceiling on ONE exit's draw, in milliseconds of main-thread work per frame.
 *
 * Unchanged from the gate's first version, and deliberately: the 2026-08-22 repair replaced a broken
 * premise guard, it did not re-bound the criterion. A 60 Hz frame is 16.67 ms, so a per-exit cost in
 * thousandths of a millisecond is the finding — the bound exists to catch the day the exit stops
 * being one static image at depth 7.
 *
 * ⚠️ **This ceiling is not watchable-red on this harness, and that is arithmetic rather than an
 * omission.** To push `perExitWork` over 0.05 ms a fixture has to add `2560 × 0.05 = 128 ms` to the
 * top arm's every frame, which serves ~23 frames in a `SAMPLE_TICKS` window against a `MIN_SAMPLES`
 * of 60 — the sampler's own precondition fires first, so the ceiling can never be the assertion that
 * reds. What *is* watched failing is the guard the repair replaced, under `PERF_MUTATION=capdraw`.
 * The ceiling's honesty rests on that guard instead: the reported figure is linear in the gap by
 * construction, and the gap is asserted to respond to the number drawn.
 */
export const MAX_EXIT_WORK_MS = 0.05;

/** The same ceiling on the GPU side, where the exit is 124 416 pixels of fill per frame. */
export const MAX_EXIT_GPU_MS = 0.05;

/**
 * **The floor every gap in the sweep must clear — the statistic that replaced
 * `MAX_LINEARITY_SPREAD`.**
 *
 * Each gap is `delta(n) − delta(previous n)`, and each delta is a median of `ROUNDS` per-round
 * paired differences. A gap that does not clear this floor says the frame stopped getting more
 * expensive when more exit was drawn — at which point dividing anything by a copy count is
 * arithmetic on noise, and the ceilings below would pass for an exit of any cost whatever.
 *
 * 🔴 **This is what the old guard's error message claimed to be checking**, and it is checkable
 * where a cost exponent is not: a gap is a difference the fixed part of the amplifier's cost
 * cancels out of, so it is neither a ratio of two small numbers nor sensitive to the ~0.5 ms
 * constant in this file's table.
 *
 * Chosen at roughly a quarter of the smallest reading in the selection set and confirmed on a
 * held-out set; both are in `docs/qa/phase-08-gate-entry.md`. `PERF_MUTATION=capdraw` is the red
 * proof.
 */
export const MIN_SWEEP_GAP_GPU_MS = 0.3;

/** The same floor on the main-thread arm. Three clock steps, against readings of 10 to 21. */
export const MIN_SWEEP_GAP_WORK_MS = 0.3;

/**
 * `PERF_MUTATION=capdraw` — the red proof for the sweep-gap floors, and the mutation they NAME.
 *
 * The visible count is capped at `FIT_MID`, so the top arm asks for `FIT_HIGH` copies and draws
 * `FIT_MID` of them. Nothing else changes: the pool is the same size, the display list is the same
 * length, the control still draws one exit, every window still serves its frames, and the first gap
 * still clears its floor comfortably. The only thing that changes is that **the frame stops getting
 * more expensive when more exit is asked for** — which is precisely the state in which dividing a
 * delta by a copy count fabricates a per-exit figure, and precisely what the old `spread < 4` guard
 * said it was checking while being unable to.
 *
 * ⚠️ It is deliberately NOT a source change. Capping the amplifier is the same lever the measurement
 * already pulls, and this gate's defect was never in the game.
 */
export const CAPDRAW_LIMIT = FIT_MID;

/**
 * `PERF_MUTATION=perexit` — a genuine per-exit cost regression, and what it demonstrates.
 *
 * A per-frame main-thread cost of `PER_EXIT_COST_MS` for **every visible copy**: exactly the shape
 * of the defect the ceilings exist for, an exit that got more expensive to draw. It is the other
 * half of C1's pair — the gap guards must stay GREEN under it, because the cost still scales with
 * the count and the sweep still responds, while the reported per-exit figure **rises with it**. That
 * is what makes the ceilings a measurement of the exit rather than decoration beside it.
 *
 * ⚠️ **It does not turn the ceilings red, and cannot.** 0.05 ms per exit at 5120 copies is 256 ms of
 * added work in every frame of the top arm, which serves ~11 frames in a `SAMPLE_TICKS` window
 * against a `MIN_SAMPLES` of 60 — `sampleArm`'s own precondition fires first. See
 * `MAX_EXIT_WORK_MS`.
 */
export const PER_EXIT_COST_MS = 0.005;

/** Charge `costMs` of main-thread time per visible copy, every frame. */
export async function installPerExitCostFixture(page: Page, costMs: number): Promise<void> {
  await page.evaluate((ms) => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as { __gateBloat?: { visible: boolean }[] };
    const burn = (): void => {
      const n = (scene.__gateBloat ?? []).filter((o) => o.visible).length;
      if (n > 0) {
        const until = performance.now() + n * ms;
        while (performance.now() < until) {
          /* burn main-thread time, exactly as a costlier exit would */
        }
      }
      requestAnimationFrame(burn);
    };
    requestAnimationFrame(burn);
  }, costMs);
}
