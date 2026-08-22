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
 *
 * ## 🔴 And 8192 was added, because at a 2x span the EXPONENT is not resolvable either
 *
 * The sweep was `[0, 1024, 2048]`, and `effectSweep.ts` has the algebra: over a 2x amplification
 * ratio no bound on the old per-particle *spread* could order any cost law below `N^3`, and the
 * replacement statistic — the exponent `k` itself — inherits the same arithmetic. One clock step on
 * the low delta is worth `ln(1.2)/ln(2)` = **0.26** of `k` at a 2x span; over the 8x span from
 * `HALF_ALIVE` to `STORM_ALIVE` it is **0.088**. Widening the points is a change of instrument and it
 * is the move this file's own history already licensed *("the N values have to separate instead")*.
 *
 * The cost is five more windows per run, ~10 s a round. 2048 stays as an ordering point for Guard 1:
 * a middle point is what makes a non-monotonicity between the fit points visible at all.
 */
export const SWEEP_ALIVE = [0, 1024, 2048, 8192] as const;

/** The top of the sweep, and the amplification the per-particle figure is divided back out of. */
export const STORM_ALIVE = SWEEP_ALIVE[SWEEP_ALIVE.length - 1];

/**
 * The lower fit point — the low end of the exponent measurement, and what `MIN_HALF_STORM_WORK_DELTA_MS`
 * floors.
 *
 * 🔴 **Named, not `SWEEP_ALIVE[length - 2]`.** That index is what the gate round found had drifted:
 * the constant below still argued its value from the 512-vs-0 gap while the index had moved it to
 * 1024, and adding a fourth sweep point would have silently moved it again — to 2048, away from the
 * shipped 96 rather than towards it. The lower this point sits, the less of the divide-back is
 * inference, so it is the *second* element by intent rather than the second-to-last by accident.
 */
export const HALF_ALIVE = SWEEP_ALIVE[1];

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
 * under one step, so nothing below ~1024 is distinguishable from the control here — which is why the
 * sweep's lowest non-zero point IS 1024 and why the table above stops arguing about 64 and 128, two
 * values `SWEEP_ALIVE` no longer contains. The shipped figure is not read directly at all: it is the
 * amplified storm, divided back.
 *
 * 🔴 **That divide-back used to be justified as "legal only while the sweep is linear", and nothing
 * asserted linearity** — `effectSweep.ts` has the algebra of the guard that was supposed to. It is
 * justified now by the measured cost EXPONENT and its floor, and the sentence is corrected here
 * rather than left to be re-read as a claim.
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
 * 🔴 **Three of the four loads in that sentence are asserted; the level, the HUD and the player
 * sprite are NOT.** The only per-arm draw claims anything takes are `counts().opaque` (enemy bodies),
 * `particleCounts().drawn` (particles) and `effectShake.ts`'s counter. Nothing observes the tilemap
 * layer, the parallax layers, `UIScene` or the player. All of them make `onWork` *cheaper* when
 * absent, and this is the one bound in the file that is not a difference — so it is the one bound
 * they can move. That is the same defect one layer out from Guard 0b, which exists because the
 * headline assertion named twenty enemies nobody checked were drawn; it is disclosed here and
 * recorded as a §9.8 narrowing rather than closed, because closing it means a fourth counter and a
 * fourth mutation for loads no phase criterion names.
 *
 * ## 🔴 What that sentence does NOT include, and it is a real narrowing
 *
 * The frame this is asserted on carries **no combat**. `installStorm` holds the player invulnerable
 * every frame — it has to, or the sweep cannot order at all (its docstring has the inversion
 * argument) — and with no hit ever landing there is no `hurt` or `death` state, no `freezePair`
 * hit-stop, no knockback, no i-frame flicker, and **none of `gameEffects.render()`'s own trigger
 * paths** (`strike`, `hurtVent`, `landingDust`) ever fires.
 *
 * 🔴 **It used to say "no screen shake" too, and that was criterion 9.5 failing rather than a
 * narrowing.** 9.5's sentence is *max enemies + max particles + shake*, so a shake absent from every
 * window is a load the criterion names and the number does not carry. `effectShake.ts` now drives one
 * through the shipped `land` arming path — the single route that arms a shake without also emitting a
 * burst, which is what keeps the inversion out — in **every** arm, so it divides out of the paired
 * delta while sitting inside the absolute term this constant bounds. `sampleArm`'s Guard 0c fails any
 * window that did not carry it on more than half its frames.
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
 * ## 🔴 The run sets, corrected — this used to cite evidence that was not there *(C9)*
 *
 * It read: *"The selection set then read 0.500 / 0.500 / 0.600 ms … Chosen on one set of runs and
 * confirmed on a HELD-OUT set that had no say in it; both sets are in `docs/qa/phase-09-polish.md`."*
 * The gate round's `performance-engineer` brief grepped that log for both figures and found **zero
 * matches for either** (finding M3) — the same shape as the missing covering gate three paragraphs
 * up, in the same file, disclosed and then repeated.
 *
 * What is true: **2.5 is derived, not fitted.** It is 16.67 / 6 rounded down, from the claim in this
 * docstring, and no run had a vote in it — so there is no selection set to record and the three
 * quoted readings were a sanity check whose provenance nobody wrote down. They are withdrawn rather
 * than re-cited. What DOES exist is confirmation, and it is real: two disjoint held-out sets, the
 * gate round's 8 runs and the fix round's 10, tabulated under
 * **§"9.5 — the bound-confirmation run sets"** in `docs/qa/phase-09-polish.md`.
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
 * Without it the per-particle figure below is a delta of noise divided by a big number, and the
 * exponent taken off the same two deltas is a ratio of two such noises.
 *
 * 🔴 **What it does NOT do, and the docstring used to claim it did**: it is not a check that anything
 * was DRAWN. Under `PERF_MUTATION=scale0` — zero particles submitted to the batch on every window —
 * `ParticleEmitter.preUpdate` still walks every alive particle, so roughly half the per-particle cost
 * survives and the amplifier still amplifies: the gate round measured this floor, its sibling, the
 * ordering check and all three millisecond bounds **passing on a build that drew nothing**, with only
 * Guard 0 red. This is a RESOLUTION premise. Guard 0 is the draw premise, and a future edit that
 * weakened Guard 0 on the strength of "the amplifier check also catches that" would be wrong.
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
 * Set two clock steps rather than close to the reading. It guards `sweepDelta(0, STORM_ALIVE)`, which
 * is the largest gap in the sweep and reads ~6 ms — so its margin is enormous and the tight one is
 * its sibling below, which is where the seven-sweep distribution belongs and now lives.
 */
export const MIN_STORM_WORK_DELTA_MS = 0.2;

/**
 * The same floor under the **lower fit point**, `HALF_ALIVE`, and it guards a sharper edge than its
 * sibling: this is the delta the exponent's error budget is almost entirely made of.
 *
 * 🔴 The exponent takes the log of `stormDelta / halfDelta`. Guard 2 floors the numerator — but
 * nothing floors the denominator, and Guard 1 permits *equality*, so `sweepWork[HALF_ALIVE] ===
 * sweepWork[0]` is a legal clean outcome. The log then goes to `+Infinity` and the run reds with a
 * message about the cost law when what actually happened was that the clock could not separate two
 * readings.
 *
 * That is not a hypothetical margin: it was reproduced. At the sweep's original half point of **512**
 * this gap fell to **two** clock steps in three of seven sweeps, against five for the 1024 gap, and
 * it red 1 run in 6 the moment Guard 1 stopped firing first. Its own advice — *raise the sweep
 * points* — is what was taken, twice: the half point moved to 1024, and `HALF_ALIVE` is now a named
 * constant so a fourth sweep point cannot move it again.
 *
 * Across seven clean sweeps the 1024-vs-0 gap it now guards was never below **five** clock steps
 * (0.500 / 0.600 / 0.700 / 0.600 / 0.500 / 0.600 / 0.700 ms), so 0.2 needs a three-step adverse move
 * of a median to fire and a single step of quantisation noise cannot satisfy it.
 *
 * ⚠️ **The message this guard carries matters more than the guard.** A bare exponent failure tells
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
 * **three** grid steps and the readings sit at one, which is the margin, not the derivation.
 *
 * 🔴 The sentence that followed cited *"a HELD-OUT set — both are in `docs/qa/phase-09-polish.md`"*
 * and neither set was in that log (finding M3, and see `MAX_EFFECT_FRAME_WORK_MS` for the same
 * correction at length). There is no selection set: this is derived from the constant above. The
 * confirmation is genuine and is now written down — §*"9.5 — the bound-confirmation run sets"*.
 */
export const MAX_EFFECT_WORK_DELTA_MS = 0.3;

/**
 * The ceiling on ONE shipped particle's main-thread cost, in milliseconds per frame.
 *
 * 🔴 **This is a divided-back figure, and what makes it legitimate is `MIN_COST_EXPONENT`.** The
 * shipped 96-particle ceiling sits *below* `performance.now()`'s 0.1 ms quantisation grid in this
 * browser, so it cannot be read directly: 0.100 and 0.200 are adjacent steps on the clock, not a
 * measurement. What is measured is the amplified storm; what is reported is that delta over the
 * particle count.
 *
 * That division is **conservative exactly while the cost exponent `k` is at least 1** — per-particle
 * cost is `c * N^(k-1)`, so at `k > 1` a figure divided back from 8192 over-states what 96 particles
 * cost, and at `k < 1` it under-states it. `effectSweep.ts` measures `k` and floors it; the spec
 * withdraws the divide-back rather than reporting an extrapolation through a region nothing measured.
 * The predecessor of that guard bounded a *derived spread* at a 2x amplification ratio and could not
 * fire below `k = 3`, which is how a constant-cost frame would have been reported as a per-particle
 * cost.
 *
 * ## Where 0.003 comes from, and it is not from what passes
 *
 * The claim it encodes: **at its shipped ceiling the whole effects feature may not take more than
 * about 2 % of a 60 Hz frame.** 16.67 ms times 2 % is 0.33 ms, over `SHIPPED_PEAK_ALIVE` particles
 * is 0.0035 ms each, rounded down to 0.003. That is a budget decision about a game, arrived at
 * without looking at a measurement.
 *
 * ⚠️ **The measurements that used to be quoted here cited sweep points that no longer exist** — 512
 * has not been in `SWEEP_ALIVE` since the sweep was widened, and the figures beside it were never
 * re-taken. Withdrawn rather than re-cited, exactly as `MAX_EFFECT_FRAME_WORK_MS`'s were. The live
 * per-particle reading is printed by the spec on every run and tabulated in
 * `docs/qa/phase-09-polish.md`; the bound sits about 4x above it.
 *
 * 🔴 And the derived *"the whole shipped feature costs roughly 0.06 ms"* is withdrawn with them. That
 * sentence multiplied a per-particle figure divided back from a high-N measurement by 96 — which at
 * the measured `k > 1` over-states the shipped cost, by ~2x at the exponents this harness reads. The
 * over-statement is the safe direction for a ceiling and the wrong direction for a *reported
 * measurement*, so the number is not restated. `MAX_EFFECT_WORK_DELTA_MS`'s own readings — 0.000 or
 * 0.100 ms per pair, nothing between — are what the shipped peak actually costs, at the only
 * resolution this clock has.
 */
export const MAX_PER_PARTICLE_WORK_MS = 0.003;

/**
 * The floor on the drawn-particle count at the shipped peak — 9.6's load-bearing literal.
 *
 * Not `SHIPPED_PEAK_ALIVE` itself: the count is read between frames, and a particle that expired
 * since the last top-up is legitimately absent. Two-thirds of the ceiling is far above anything a
 * broken path produces (which is zero) and far below anything a working one produces (which is 96).
 */
export const MIN_DRAWN_AT_PEAK = 64;
