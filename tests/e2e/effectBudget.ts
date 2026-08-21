/**
 * Every constant behind criteria 9.5 and 9.6 — what a frame of particles may cost, and what each
 * number means.
 *
 * The spec states the claims; this file is the numbers, argued once beside the code that uses them.
 * Same seam `perfBudget.ts` draws for the fleet, and the same reason: a bound whose derivation lives
 * in a QA log drifts from the assertion that uses it.
 *
 * The COUNTER moved to `effectCounts.ts` when this file crossed 400 lines under review fixes —
 * "what a frame may cost" here, "what a frame actually drew" there.
 *
 * 🔴 **`perfSampler.ts` is NOT extended.** It sits at 398 of the 400-line limit. `counts(page)` is
 * imported UNCHANGED and called alongside `particleCounts(page)`, which is the same coverage without
 * editing a file with two lines of headroom.
 */

import { EFFECT_PEAK_ALIVE, EMITTER_SPECS, type EffectKind } from '../../src/render/effects';


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
 * than 2048 particles" is exactly the failure the ordering check exists to catch.
 *
 * ## 🔴 It was `[0, 64, 128, 256, 512, 1024]`, and that sweep could not order itself
 *
 * Six back-to-back runs on `ca3814f`, alone on a quiet box, **ordered 1 in 6** — five of them failing
 * on the *same* gap, `64` against `0`, and a separate sample of four elsewhere failed twice on two
 * other gaps. Pooling all six runs' per-round readings, gap by gap:
 *
 * | gap | ΔN | sign of the per-round delta, over 30 observations |
 * |---|---|---|
 * | 0 → 64 | 64 | **+12 / −11 / =7** — a coin flip |
 * | 64 → 128 | 64 | **+15 / −10 / =5** — a coin flip |
 * | 128 → 256 | 128 | +18 / −3 / =9 |
 * | 256 → 512 | 256 | +22 / −5 / =3 |
 * | 512 → 1024 | 512 | **+30 / −0 / =0** |
 * | 0 → 1024 | 1024 | **+29 / −0 / =1** |
 *
 * The cause is arithmetic, not luck. One particle costs ~0.001 ms here, so a 64-particle gap is
 * ~0.06 ms of signal — **below `CLOCK_GRID_MS`** — while a single reading sits 0.131 ms from its own
 * point median on average. The adjacent-pair test at the bottom of that sweep was asking the clock a
 * question it cannot answer, and the answer it returned was a coin toss.
 *
 * ⚠️ **And it is not fixable by sampling harder.** Resolving a 0.06 ms gap against a per-reading
 * spread of ~0.3 ms needs a standard error near 0.02 ms, which is ~225 rounds — about six hours per
 * run. The N values have to separate instead, which is a change of *instrument*, not of bound.
 *
 * So every gap is now **1024 particles**, ~1 ms of signal against that same noise, and the two floors
 * in this file clear it by a margin instead of by luck: `MIN_HALF_STORM_WORK_DELTA_MS` is now read at
 * 1024 rather than 512, where the old sweep put it 1–3 clock steps from the bound and red it 1 run in
 * 6 the moment Guard 1 stopped firing first. **No bound in this file moved.**
 */
export const SWEEP_ALIVE = [0, 1024, 2048] as const;

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
 * ## 🔴 What that sentence does NOT include, and it is a real narrowing
 *
 * The frame this is asserted on carries **no combat**. `installStorm` holds the player invulnerable
 * every frame — it has to, or the sweep cannot order at all (its docstring has the inversion
 * argument) — and with no hit ever landing there is no `hurt` or `death` state, no `freezePair`
 * hit-stop, no knockback, no screen shake, no i-frame flicker, and **none of
 * `gameEffects.render()`'s own trigger paths** (`strike`, `hurtVent`, `landingDust`) ever fires.
 *
 * So "worst case" here is *the worst STEADY-STATE frame*: the largest fleet this project measures,
 * the shipped particle ceiling, and everything that draws every frame regardless. It is not the
 * worst frame the game can produce. `MAX_EFFECT_FRAME_P95_MS` is what covers the spiky end of the
 * window. Vault 9.3: a gate's blind spots are part of its result.
 *
 * ⚠️ **This paragraph used to name a covering gate that did not exist**, and the citation was worse
 * than the gap it disclosed *(C9)*: it said *"the trigger path itself is covered by criterion 9.1's
 * behavioural spec rather than here"*, and 9.1's spec reads sim fields and camera offsets and never
 * observes a particle. Nothing anywhere asserted that a game event produced a burst — so
 * `gameEffects.emit`'s `emitter.explode(burst.count, …)` mutated to `explode(0, …)`, which is every
 * in-game spark, steam and dust drawing nothing, left the entire unit suite green and was invisible
 * to 9.5 and 9.6 as well, because `installStorm` calls `explode` on the emitter handles directly and
 * **never routes through `gameEffects.emit`**.
 *
 * The trigger path is covered now, by two gates written for it: `the game's OWN trigger path emits
 * particles` in `phase-09-draw.spec.ts` (a real landing, in a browser, with no storm installed), and
 * the `burst count survives the trip to the emitter` block in
 * `tests/unit/effects-draw-path.test.ts`. Both name `explode(0, …)` as the mutation they exist to
 * catch.
 *
 * The selection set then read 0.500 / 0.500 / 0.600 ms, so the bound is roughly 4x above the worst
 * of them. Chosen on one set of runs and confirmed on a HELD-OUT set that had no say in it; both
 * sets are in `docs/qa/phase-09-polish.md`.
 */
export const MAX_EFFECT_FRAME_WORK_MS = 2.5;

/**
 * The ceiling on the ON arm's **95th percentile** frame — the burst end of the window.
 *
 * 🔴 **Every other millisecond bound in this file is a median, and two are medians of medians**, so
 * a stall on one frame in five hundred moves none of them. `workP95Ms` exists in the same `Sample`
 * for exactly that reason — `perfSampler.ts:70-77` records it being added after an adversarial brief
 * found *"the one frame capable of showing an O(n²) burst was being reported to a human and gated by
 * nothing"*. This gate had reproduced that omission: it neither asserted nor printed it.
 *
 * ## And the burst frames ARE inside the window, which is what makes this worth asserting
 *
 * `EmitterSpec.lifespanTicks` is a **scalar**, not a range, so every particle from one `explode()`
 * expires on the same frame — and `installStorm`'s top-up then re-explodes the whole cap in one
 * frame. The storm is therefore not a smooth trickle: it is a full-cap `explode()` every 18 ticks
 * for sparks, 45 for steam, 22 for dust, through the shipped call `gameEffects.emit` uses. The
 * emission spike the feature actually produces is in the sampled window, several times a second,
 * and only a percentile can see it.
 *
 * ## The number is DELIBERATELY not tuned to the observation
 *
 * 16 ms is `levelPerf.ts:71-84`'s `MAX_LEVEL_WORK_P95_MS` and its reasoning verbatim: one whole
 * 60 Hz frame, chosen because *any* single frame taking a whole frame budget is a defect regardless
 * of what the machine happens to read today. It is not derived from the measurements and must not be
 * tightened toward them — the observed p95 is printed in the spec's output for whoever wants the
 * real figure.
 */
export const MAX_EFFECT_FRAME_P95_MS = 16;

/**
 * The floor on the paired delta at the amplified peak — the **premise check**, in the shape
 * `phase-08-gate-perf.spec.ts`'s *"the amplifier is not amplifying"* guard establishes.
 *
 * Without it the per-particle figure below is a delta of noise divided by 1024, and
 * `MAX_EFFECT_FRAME_WORK_MS` would pass for a build whose particles cost anything at all — because
 * a build that drew none would pass it most comfortably of the lot.
 *
 * ⚠️ **It is a FLOOR, so it is one of the three bounds here that can false-RED.** The other two are
 * `MIN_HALF_STORM_WORK_DELTA_MS` and, behind it, `MAX_LINEARITY_SPREAD`.
 *
 * 🔴 **An earlier version of this docstring called it "the one bound here that can false-RED", and
 * that was wrong in a way worth recording**: the review found the *half* amplification is the
 * tighter route by three clock steps, and that its failure mode is catastrophic in magnitude rather
 * than marginal. `MIN_HALF_STORM_WORK_DELTA_MS` exists because of that, and this sentence is
 * corrected rather than quietly dropped.
 *
 * Set two clock steps rather than close to the reading. Across seven clean sweeps the 1024-vs-0 gap
 * was never below **five** clock steps (0.500 / 0.600 / 0.700 / 0.600 / 0.500 / 0.600 / 0.700 ms),
 * so 0.2 needs a three-step adverse move of a median-of-five to fire, and it is still twice the
 * clock's own resolution — a single step of quantisation noise cannot satisfy it.
 */
export const MIN_STORM_WORK_DELTA_MS = 0.2;

/**
 * The same floor under the **half** amplification, and it guards a sharper edge than its sibling.
 *
 * 🔴 `MAX_LINEARITY_SPREAD` divides by `perParticleHalf`. Guard 2 floors the 1024 amplification so
 * `perParticle` cannot be zero — but nothing floored the 512 one, and Guard 1 permits *equality*, so
 * `sweepWork[512] === sweepWork[0]` is a legal clean outcome. `perParticleHalf` is then 0, the
 * spread divides by the `1e-9` epsilon, and the run reds at roughly **5 x 10^5**.
 *
 * That is not a hypothetical margin: across the same seven sweeps the 512-vs-0 gap fell to **two**
 * clock steps three times, against five for the 1024 gap. The linearity check was the tightest
 * false-red route in the file and it was undisclosed.
 *
 * ⚠️ **The message this guard carries matters more than the guard.** A bare linearity failure tells
 * the next reader *"the cost does not scale, withdraw the divide-back"* — which under this repo's own
 * rule sends them to REPLACE THE STATISTIC over one step of `performance.now()` quantisation. That
 * is the mistake the first sweep already made once. So this fires first, and it says quantisation.
 */
export const MIN_HALF_STORM_WORK_DELTA_MS = 0.2;

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
 * `phase-08-gate-perf.spec.ts:129`'s `MAX_LINEARITY_SPREAD`, for its reason verbatim: dividing a
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
