/**
 * The two perf bounds this project has had to REPAIR, and the measurement records that set them.
 *
 * Split out of `perfBudget.ts` on 2026-08-18, when repairing criteria 6.9 and 7.7 pushed that file
 * past the 400-line rule. The split is along a real seam rather than an arbitrary one: these are
 * the HUD and audio budgets, two of which were **reported failing or unstable**, were re-measured
 * against a committed mutation, and carry the readings and the stated floor that justify their
 * number. The bounds left behind in `perfBudget.ts` are the fleet, combat and level ones, derived
 * once and unchanged since.
 *
 * `MAX_HUD_WORK_DELTA_MS` travels with them rather than staying behind: it was never broken, but it
 * is the bound `MAX_HUD_GPU_DELTA_MS` argues against — a main-thread statistic that cannot inherit
 * a fill-rate criterion — and separating the two would leave that argument pointing across files.
 *
 * Read `docs/qa/session-bugfix-perf-gates.md` for the session that produced these, and
 * `docs/TESTING-RULES.md` before arguing with any of it.
 */

/**
 * Criterion 6.9 - the ceiling on the **median per-pair GPU millisecond delta** the HUD adds.
 *
 * 🟢 **REPLACED THE RATIO 2026-08-18.** `MAX_HUD_GPU_RATIO` was recorded broken twice over: its
 * resolution floor was *bracketed, not measured* (one full-screen scrim invisible, five visible at
 * 2.688, nothing between ever run), and it passed and failed on the SAME unchanged commit at 0.76x
 * and 3.53x. Both symptoms have one cause, and this file already named it in the abstract: **a
 * ratio of two very small numbers is dominated by noise.** The arms sit ~0.13 ms apart measuring a
 * HUD that costs ~0.001 ms, and the OFF arm's median collapses toward the GPU timer's own
 * resolution floor - 0.035 ms has been observed - which makes the quotient explode for reasons that
 * have nothing to do with what was drawn.
 *
 * ## Measured, not argued
 *
 * The scrim mutation is COMMITTED now (`tests/e2e/scrimMutation.ts`, driven by
 * `PERF_MUTATION=scrimN`), so the sweep the previous session was interrupted part-way through
 * finally ran. At `PAIRS = 10` with AB/BA ordering, one session, RTX 4080:
 *
 * ```
 *            ratio            paired delta (ms)
 * clean      0.502 - 1.692    -0.0312 .. 0.0835   (16 runs; 13 of them under 0.031)
 * 1 scrim    1.263 / 1.393     0.0358
 * 2 scrims   1.665 / 3.080     0.0328
 * 3 scrims   1.739 / 1.821     0.0983  0.3082
 * 4 scrims   2.770             0.1725  0.2749
 * 5 scrims   1.678             0.1044
 * 6 scrims   -                 0.3057
 * 8 scrims   2.777             0.2396  0.2412  0.4019
 * ```
 *
 * **The ratio column is the finding.** Clean runs reach 1.692 while two full-screen scrims read
 * 1.665, and five scrims (1.678) are indistinguishable from a clean run. It is not a tight bound
 * needing adjustment - it does not order its own mutation. The delta column does.
 *
 * ## 0.2 ms, and the floor STATED rather than bracketed
 *
 * 2.4x the worst clean reading of sixteen (0.0835), whose next-worst is 0.0307.
 *
 * ✅ **Seven more clean runs, and the worst reading did not move** — Codex implementation review 2
 * called this bound "another empirically lucky perf statistic" and its own gate-owner record left the
 * question open at three clean runs, so the answer was measured rather than argued. Seven fresh clean
 * runs read `0.0266  -0.0010  -0.0072  0.0389  0.0824  -0.0143  0.0230` — **worst 0.0824, under the
 * previous worst of 0.0835**, and the last three of them had no say in any bound.
 *
 * That makes **23 clean runs in total with a worst reading of 0.0835 and nothing above 0.09**,
 * against a 0.2 ms bound: a 2.4× margin that has now held across every run this project has made.
 * No false red has been observed. The per-pair finding below is unchanged and stays open — the
 * *mechanism* for one is still there — but "lucky" is a weaker claim after 23 runs than after three,
 * and the honest statement is that the median survives the noise in practice while nothing proves it
 * must.
 *
 * 🔴 **MAJOR, OPEN: the PER-PAIR noise is roughly 5x anything this record disclosed.** The
 * adversarial brief printed the ten individual deltas behind each median, and every clean run
 * contains at least one pair whose magnitude exceeds this bound outright:
 *
 * ```
 * clean run 1:  0.2406  0.0819  0.6748  0.0000 -0.0020 -0.0430  0.0655  0.0072  0.0010  0.0358
 * clean run 2:  0.7444  0.0020  0.0010  0.0123 -0.1782 -1.0424  0.0041 -0.0113 -0.0143  0.0000
 * clean run 3: -0.0502 -0.7393 -0.0573  0.0072  0.6902 -0.0051  0.0205 -0.0010  0.0072  0.0020
 * ```
 *
 * The cause is visible in the GPU-median arrays: about **one window in ten reads 0.7-1.2 ms against
 * a 0.14 ms baseline**, on BOTH arms and independent of HUD state. When such a spike lands on one
 * side of a pair only, that pair's delta blows past 0.2 ms by three to five times.
 *
 * The median of ten survived all three runs because the spikes are rare and not consistently
 * same-signed — which is why a median was chosen. But the safety margin here is **empirical, not
 * structural**: no false red was observed in three runs, and none is proved impossible either.
 * Recorded rather than smoothed over, because this project's own testing rules name "a bound that
 * would not have survived a week" as its recurring failure. **Closing it needs either the spike's
 * root cause (OS scheduling, driver, thermal — unknown) or a statistic robust to a one-in-ten
 * outlier by construction rather than by luck.**
 *
 * ⚠️ **Demonstrated floor, and it is not flattering.** This gate resolves **six or more**
 * full-screen alpha scrims reliably (0.3057, and 8 scrims at 0.2396/0.2412/0.4019, all red).
 * Three, four and five are BORDERLINE - each has been observed both above and below 0.2. One and
 * two it does not resolve at all: 0.0358 and 0.0328, inside a clean band reaching 0.0835.
 * Re-confirmed independently by the adversarial brief: `scrim2` read 0.0696 and PASSED,
 * `scrim6` read 0.6697 with all ten pairs between 0.53 and 0.98 and FAILED.
 *
 * The practical consequence, stated plainly because the brief asked it directly: **any HUD
 * change whose true GPU cost stays under roughly 0.2 ms reads as a pass** - a modest overlay, a
 * few translucent particles, one more alpha layer. **Phase 9 is particles**, so this is the
 * number that phase must be measured against, knowing what it cannot see.
 *
 * That is weaker than hoped and is recorded rather than rounded away 🔴 **but it is the first
 * version of this criterion that orders its own mutation at all.** The ratio it replaces put five
 * scrims (1.678) below a clean run (1.692).
 *
 * ⚠️ **Both bounds this session were chosen on one set of runs and CONFIRMED on a held-out set,
 * and the hold-out caught an overfit BOTH times.** Here a 0.06 bound chosen from nine clean runs
 * (worst 0.0307) false-redded on a tenth at 0.0835. Selecting and proving on the same data is how
 * this criterion, criterion 7.7, and the previous session's replacement statistic all got here.
 *
 * 🔴 It is still a **GPU** statistic, and that is deliberate rather than incidental. The
 * main-thread `MAX_HUD_WORK_DELTA_MS` below cannot inherit this criterion at any bound: a
 * full-screen scrim is fill rate and costs the main thread essentially nothing, so the defect 6.9
 * names is invisible to it by construction.
 */
export const MAX_HUD_GPU_DELTA_MS = 0.2;

/**
 * The **absolute** ceiling on the HUD's added main-thread milliseconds per frame.
 *
 * This is the assertion that actually expresses "frame budget", and it is here because the ratio
 * above cannot: with a 0.4ms denominator, a ratio is a statement about a very small number divided
 * by another very small number, and 0.1ms of quantisation moves it 25 %. Milliseconds against the
 * 16.67ms frame do not have that problem.
 *
 * Measured at ~0.1ms. **Bounded at 1.0ms**, 6 % of a frame.
 *
 * 🔴 It was 2.0ms, and the performance owner's adversarial brief was right that this is the
 * load-bearing bound of the three — the ratio is decorative at 0.1ms quantisation — and that 2.0ms
 * left room for a **10-19x** regression to pass. 1.0ms halves that.
 *
 * Not tighter than 1.0ms, and the reason is the same quantisation: both arms round to 0.1ms, so a
 * delta measured at 0.1ms can legitimately read anywhere in 0.0-0.2ms on a noisier run. 1.0ms is
 * five times the worst honest reading — tight enough to matter, loose enough not to fail at random
 * and teach the next reader to raise it.
 */
export const MAX_HUD_WORK_DELTA_MS = 1;

/**
 * Criterion 7.7 — the ceiling on the **median of the per-pair** `frames-per-tick without audio /
 * frames-per-tick with audio` ratios.
 *
 * 🟢 **REPAIRED 2026-08-18. It was REPORTED FAILING, and this is what it took.**
 *
 * ## What was wrong, and what it was not
 *
 * At 1.15 this bound could not tell its own 30 ms-per-cue proving mutation (1.0943) from a clean
 * run (twelve runs spanning 0.9331-1.0961). It had been raised there precisely because 1.02
 * false-redded about one run in six. Both facts pointed at the bound; **neither was about the
 * bound.** The measurement design was wrong in two ways, and fixing those made 1.02 work:
 *
 * **1. The pairing was thrown away.** The statistic was `median(off.rate) / median(on.rate)` — two
 * medians taken independently across the run, then divided. Each pair's two windows run seconds
 * apart on the same machine in the same state, so their ratio cancels drift that two independent
 * medians carry straight through. It is now the median of the six per-pair ratios.
 *
 * **2. The arm order was fixed.** Every pair sampled `on` then `off`, defended by a comment arguing
 * that a constant bias is better than one that cancels. It is not: a constant bias is **attributed
 * to the treatment arm**, which is the one thing a paired design exists to prevent. AB/BA now
 * alternates, and `PAIRS` went 3 to 6.
 *
 * **3. Six pairs was still too few, and the HELD-OUT run is what proved it.** With `PAIRS = 6` the
 * six-run clean selection set read 0.9884-1.0054 against a mutated 1.0278 — apparently clean
 * separation, and a bound of 1.02 chosen from it. The **seventh** clean run, held out from the
 * selection, read **1.0208 and false-redded.** That is the overfit this project has now made three
 * times, caught on the fourth by the one discipline that can catch it: choose on one set of runs,
 * confirm on a set that had no say in the choice. `PAIRS` is 10.
 *
 * ## The measurements this bound is set from
 *
 * Interleaved in one session on the GPU project, RTX 4080, per `docs/TESTING-RULES.md` — nothing
 * here is compared against a figure recorded on another day. All at `PAIRS = 10`:
 *
 * ```
 * clean    0.9927  0.9946  0.9947  0.9948  1.0000  1.0011  1.0022   (7 runs, worst 1.0022)
 * mutated  1.0915  1.0961  1.0961                                   (3 runs, best  1.0915)
 * ```
 *
 * The clean spread is 0.95 % wide, against 3.3 % at six pairs. Nothing else changed between the two
 * — same mutation, same window, same machine, same afternoon.
 *
 * ## 1.05, and both margins stated
 *
 * 4.8 % above the worst clean reading and 4.0 % below the best mutated one — near the middle of an
 * 8.9 % gap, rather than pressed against either edge as 1.02 was.
 *
 * ⚠️ **Stated floor, and it was MEASURED rather than reasoned.** The adversarial brief probed it
 * directly by editing `CUE_STALL_MS`:
 *
 * ```
 * 15 ms/cue  -> 1.0108x  PASSES
 * 20 ms/cue  -> 1.0516x  fails
 * 30 ms/cue  -> 1.0961x  fails   (the shipped mutation)
 * ```
 *
 * The true floor sits between 15 and 20 ms per cue. This docstring first carried "roughly half of
 * it or worse, about 15 ms", which was arithmetic from the frame cost — very slightly optimistic
 * rather than wrong. A stall smaller than ~20 ms per cue passes.
 *
 * ⚠️ **Confirmed on held-out runs**, not on the runs it was chosen from — see the QA log.
 *
 * ⚠️ Its other demonstrated floor, from Phase 7 and unchanged: **`sound.play()` is so cheap that
 * 500x the shipped call rate stayed invisible.** This catches stalls, not call counts.
 *
 * 🔴 The proving mutation is COMMITTED, not performed by hand:
 * `PERF_MUTATION=cue-stall npx playwright test tests/e2e/phase-07-perf.spec.ts`. It appends
 * `?perfMutation=cue-stall`, which `src/game/audio.ts` reads DEV-ONLY exactly as
 * `?breakAsset=corrupt` is read.
 */
export const MAX_AUDIO_FRAME_LOSS_RATIO = 1.05;

/**
 * Criterion 7.7 — the ceiling on the milliseconds audio adds to the MEDIAN frame.
 *
 * Catches the defect the frame count is worst at: a cost that leaks into **every** frame — an audio
 * poll in `update()`, a per-frame scan of `sound.sounds` — rather than into the 2 % of frames a cue
 * fires on.
 *
 * 🔴 **This bound was decoration until the A/B toggle was replaced, and the proof is on the record.**
 * While the off arm merely emptied the sfx cache, `audioCues()` and `playCues()` ran in BOTH arms,
 * so an every-frame cost appeared in both and cancelled. Injecting 2 ms per frame at the top of
 * `playCues` moved the median from 0.500 ms to **2.600 ms in both arms** and left the reported delta
 * at **0.000 ms** — the bound could not go red for the exact defect its own comment claimed it
 * existed to catch. The performance owner's brief flagged it as untested; measuring it showed it was
 * worse than untested.
 *
 * The toggle now detaches `GameScene.audio` entirely, so the off arm runs no audio code at all and
 * an every-frame leak lands in one arm only. Measured **0.100 ms** clean; bounded at **0.5 ms**,
 * five quantisation steps and 3 % of a 16.67 ms frame; the 2 ms/frame leak clears it fourfold.
 */
export const MAX_AUDIO_WORK_DELTA_MS = 0.5;

/**
 * Criterion 6.9's **absolute** ceiling: the whole frame's main-thread work with the HUD on, in ms.
 *
 * ## 🔴 Why this constant exists at all — Codex implementation review 2, finding 3
 *
 * Every other assertion in `phase-06-perf.spec.ts` is a RATIO or a DELTA, and both can only see what
 * DIFFERS between the arms. `GearLayer.sync()` and `GameScene.update()`'s `renderHud()` call run
 * identically with the HUD on and off, so they cancel out of all of them — meaning the criterion's
 * own words, *frame budget*, were only ever answered for the part of the HUD an A/B could vary.
 *
 * This assertion was already there for exactly that reason. Two things were wrong with it:
 *
 * 1. It was written inline as `16.67 / 3` — **5.557 ms**, a third of a frame — while the docstring
 *    directly above it claimed *"bounded at 1 ms"*. The prose had been updated when the Phase 6
 *    performance owner halved `MAX_HUD_WORK_DELTA_MS`; the code had not, and the two are different
 *    statistics anyway (that one is a delta, this one is absolute). A bound whose comment and value
 *    disagree by 5.6× is the failure this project keeps writing rules about *(vault C9)*.
 * 2. **It had no red proof of any kind.** `addScrims` cannot supply one: a scrim costs the CPU
 *    nothing, which is precisely why 6.9 asserts a GPU delta. So the one bound covering shared HUD
 *    work had never been shown capable of going red.
 *
 * ## The ladder, measured with `addHudWork` — the mutation built to prove it
 *
 * `PERF_MUTATION=hudworkN` attaches N ms of busy-wait per frame to the **Game** scene, so it runs in
 * both arms and divides cleanly out of every ratio and out of the delta. That is Codex's scenario
 * reproduced: shared HUD work growing, invisible to an A/B.
 *
 * ```
 * injected   onWork (median of 10 HUD-on windows)   at 5.557   at 2.5
 * clean      0.400 / 0.500 / 0.500 / 0.600          pass       pass
 * 1 ms       1.300                                  pass       pass
 * 2 ms       2.450                                  pass       pass      <- the floor
 * 3 ms       3.300                                  pass       FAIL
 * 4 ms       6.600                                  FAIL       FAIL
 * ```
 *
 * ## Choosing 2.5, and confirming it on runs that had no say
 *
 * Selection set: the four clean runs above, plus the 0.5–0.9 ms band this spec's prose already
 * recorded. Worst clean observed, **0.9 ms**.
 *
 * 🔴 The bound is **not** set near that worst case, and this session has two fresh scars explaining
 * why. 7.7's first bound was chosen from six runs whose worst was 1.0054 and false-redded on a
 * seventh at 1.0208; 6.9's GPU delta was chosen from nine runs whose worst was 0.0307 and
 * false-redded on a tenth at 0.0835. **Both times the true spread was 2–3× the observed worst.** So
 * 0.9 × ~2.8 → **2.5 ms**, then confirmed on runs not used to pick it.
 *
 * ⚠️ **Stated floor: about 2 ms of added shared main-thread work per frame passes.** `hudwork2` reads
 * 2.450 — under the bound, and deliberately not chosen as the proving mutation because a 0.05 ms
 * margin proves nothing. `hudwork3` at 3.300 is the committed red proof, clearing the bound by 32 %.
 * That floor is a real limit and it is **2.8× better than the 5.557 ms it replaces**, which needed a
 * 4 ms/frame regression before it noticed. It is not the 1 ms the old comment claimed, and pretending
 * otherwise is how the disagreement got here in the first place.
 */
export const MAX_HUD_FRAME_WORK_MS = 2.5;
