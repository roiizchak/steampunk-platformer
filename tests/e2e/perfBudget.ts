/**
 * **What the frame budget IS** — every number criterion 5.11 is judged against, and why each one has
 * the value it has.
 *
 * Split from `perfSampler.ts` on 2026-08-14 when that file crossed the 400-line rule after gaining
 * the GPU timer. The seam is the one this suite already uses one level up: `phase-05-perf.spec.ts`
 * states **what** the criterion asks, `perfSampler.ts` is **how** a frame is measured, and this file
 * is **what the answer is allowed to be**. Every constant here is a threshold with a written
 * justification; nothing here reaches into a page.
 *
 * ⚠️ These are ceilings shaped to catch super-linear growth, **not pins on today's numbers**. A
 * bound set tight against the current measurement fails on driver noise and teaches the next reader
 * to raise it — which is how a gate gets loosened one commit at a time.
 */

/**
 * Mirrors `DEV_FLEET_COUNT` in `src/scenes/GameScene.ts` — a private const there, not exported.
 *
 * 🔴 **Pinned against `MAX_LEVEL_ENEMIES` by `phase-05-perf.spec.ts`, added 2026-08-15.** Both
 * criterion 5.11 gate-owner briefs found the same hole: this was a flat 20, the shipped level has 2,
 * and the "22 bodies" the spec measured matched the enemy cap **by coincidence** — `MAX_LEVEL_ENEMIES`
 * appeared nowhere under `tests/e2e/` at all. Delete the cap entirely and this spec would not notice.
 *
 * The adversarial brief found the sharper consequence: a level shipping 10 enemies is legal and boots
 * fine, and would have made this test measure `10 + 20 = 30` — a total the production cap forbids.
 * The coincidence was fragile in BOTH directions, not merely unprincipled.
 */
export const DEV_FLEET_COUNT = 20;

/**
 * Mirrors `SENTRY.cooldown` (`src/sim/enemySentry.ts`) — 90 ticks, 1.5 s, between shots.
 *
 * Retyped rather than imported because this value has to reach *inside* `page.evaluate`, where no
 * module from this repository exists. `expect`ed against the live sim below, so the copy cannot rot.
 */
export const SENTRY_COOLDOWN_TICKS = 90;

/**
 * How long each half of the interleaved measurement runs, **in sim ticks**.
 *
 * 🔴 It was 120 rAF *frames*, and the criterion's own adversarial gate owner showed why that could
 * not work. Every sentry starts ready to fire (`createSentry` sets `cooldownCounter = cooldown`), so
 * all ten dev sentries volley on the same tick and then go silent for a full 90 ticks. At the 240 Hz
 * this project runs at, 120 frames is **half a second** — a third of one cooldown. The synchronised
 * volley, which is exactly the batched per-enemy cost an O(n²) sweep or an allocation storm would
 * show up in, could therefore fall entirely outside the sampled window, or in the untimed gap
 * between the spawn and the sample, and the fleet half would measure ten idle turrets.
 *
 * Ticks are the right unit because the thing being caught recurs on a tick schedule, and because a
 * frame count means a different amount of game time on every display. `2 x` the cooldown guarantees
 * **at least two full volleys** inside every window at any refresh rate.
 */
export const SAMPLE_TICKS = SENTRY_COOLDOWN_TICKS * 2;

/** A window that produced fewer samples than this measured too little to take a median of. */
export const MIN_SAMPLES = 60;

/**
 * The ceiling on `fleet / baseline` blocking-time-per-frame.
 *
 * Set from the interleaved baseline recorded in `docs/qa/phase-05-combat.md`, rounded well clear of
 * it — it exists to catch a regression whose cost grows faster than the enemy count (an O(n²) sweep,
 * a per-enemy texture upload, a per-frame allocation storm), not to pin today's number. 11x the
 * enemies costing more than 4x the frame work is that shape of defect.
 */
export const MAX_WORK_RATIO = 4;

/**
 * The same ceiling for the 95th percentile — the frames a median cannot see.
 *
 * Looser than the median's because a p95 taken over a few hundred samples is a noisier statistic and
 * a single GC pause lands in it. Not looser because bursts matter less: this is the assertion that
 * covers the synchronised ten-sentry volley, which is a handful of frames in the window and the
 * likeliest place for a per-enemy blow-up to appear.
 */
export const MAX_BURST_RATIO = 6;

/**
 * A GPU window that produced fewer non-disjoint results than this has no median worth reading.
 *
 * Lower than `MIN_SAMPLES` on purpose: GPU readback lags submission, so the ring drops the first
 * frame or two of every window and the bounded drain only recovers what has already landed. Probed
 * on this box, 30 frames yielded 27 results.
 */
export const MIN_GPU_SAMPLES = 30;

/**
 * The ceiling on `fleet / baseline` **GPU** time per frame.
 *
 * ⚠️ **Shaped to catch super-linear growth, not to pin today's number** — the same house style as
 * `MAX_WORK_RATIO`. It is deliberately NOT set tight against the measured clean ratio: a ceiling
 * that hugs the current value fails on driver noise and teaches the next reader to raise it, which
 * is how a gate gets loosened one commit at a time.
 *
 * Looser than `MAX_WORK_RATIO` because the quantity is different in kind. Main-thread work per frame
 * is roughly linear in enemy count; GPU cost is dominated by **fill rate**, and 20 more sprites over
 * three full-screen parallax layers is a small fractional increase in pixels touched — so the honest
 * clean ratio sits near 1 and the interesting failure is a large multiple, not a 20 % drift.
 */
export const MAX_GPU_RATIO = 5;

/**
 * ⚠️ **Deliberately absent: there is no MAX_GPU_BURST_RATIO.**
 *
 * A p95 ceiling was written and then removed on measurement. Across three consecutive runs the GPU
 * MEDIAN ratio was stable to 3 percent (2.18x, 2.12x, 2.12x) while the p95 ratio swung 0.08x, 1.78x,
 * 0.23x -- a 20x spread driven by compositor spikes in the baseline p95, not by the fleet. A bound
 * loose enough to survive that catches nothing; one tight enough to mean something fails at random.
 *
 * The p95 is still measured and printed by the spec. It is simply not gated, exactly as
 * long-animation-frame is not gated, and for the same reason.
 */

/* -------------------------------------------------------------------------------------------- *
 *  Phase 6 — criterion 6.9. The HUD's own per-frame cost.                                        *
 *                                                                                                *
 *  Every bound below was set AFTER the measurement, never before. Three consecutive runs of      *
 *  `phase-06-perf.spec.ts` on this box (RTX 4080, ANGLE/D3D11), each three interleaved           *
 *  HUD-on/HUD-off pairs of 180 ticks, one page:                                                  *
 *                                                                                                *
 *  | run | work on -> off      | work ratio | GPU on -> off        | GPU ratio |                 *
 *  |-----|---------------------|------------|----------------------|-----------|                 *
 *  | 1   | 0.500ms -> 0.400ms  | 1.250x     | 0.186ms -> 0.183ms   | 1.017x    |                 *
 *  | 2   | 0.500ms -> 0.400ms  | 1.250x     | 0.173ms -> 0.171ms   | 1.012x    |                 *
 *  | 3   | 0.500ms -> 0.400ms  | 1.250x     | 0.201ms -> 0.198ms   | 1.016x    |                 *
 *                                                                                                *
 *  So the whole HUD costs ~0.1ms of main thread and ~0.003ms of GPU per frame — 0.6 % and 0.02 % *
 *  of a 16.67ms frame at 60 Hz.                                                                  *
 * -------------------------------------------------------------------------------------------- */

/**
 * The ceiling on `HUD-on / HUD-off` **main-thread** work per frame.
 *
 * ⚠️ **Not tighter, and the reason is resolution rather than caution.** `workMedianMs` quantises to
 * 0.1ms on this box, and the measurement sits at 0.5 over 0.4 — so the *neighbouring representable
 * ratios* are 1.0 (0.4/0.4) and 1.5 (0.6/0.4). A bound anywhere near the measured 1.25 would be
 * decided by rounding, fail at random, and train the next reader to raise it.
 *
 * At 2.0 the HUD has to cost ~0.4ms — **four times** what it measures — before this trips. That is
 * still a real gate: the proving mutation (queueing `drawHealth`'s rectangle many times over)
 * blows straight through it.
 *
 * Read together with `MAX_HUD_WORK_DELTA_MS`, which is the bound that survives the quantisation.
 */
export const MAX_HUD_WORK_RATIO = 2;

/**
 * The ceiling on `HUD-on / HUD-off` **GPU** time per frame.
 *
 * Tighter than the work ratio because the quantity is better resolved: the GPU timer reports
 * microseconds, the three measured ratios span 1.012-1.017, and the run-to-run drift in the
 * *baseline* (0.171 -> 0.198ms) moves both arms together and so cancels.
 *
 * 1.25 leaves roughly fifteen times the measured HUD delta as headroom while still catching the
 * failure this half exists for: a HUD that starts costing real fill rate — a full-screen scrim, an
 * alpha-blended overlay, a per-frame render target — which main-thread work would not see at all.
 */
export const MAX_HUD_GPU_RATIO = 1.25;

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
 * Criterion 7.7 — the ceiling on `frames-without-audio / frames-with-audio` over one fixed window.
 *
 * **This is the load-bearing bound of criterion 7.7's frame-budget half, and it is a frame COUNT
 * rather than a millisecond figure. That choice was forced by a measurement, not preferred.**
 *
 * 🔴 The first two versions of this gate asserted on `workMedianMs`, then on `workP95Ms`, and a
 * proving mutation of **30 ms of blocking work per cue** moved the p95 by 0.400 ms — nothing. The
 * reason is structural and worth keeping written down, because it applies to every spec that reduces
 * `sample()` with a percentile:
 *
 *   this machine serves **~479 rAF frames per 120 sim ticks** — about 240 fps against a 60 Hz sim,
 *   four frames per tick. A cue fires roughly eight times in that window, so cue frames are **1.9 %
 *   of frames**. The 95th percentile is the 21st slowest of 479 and never lands on one.
 *
 * A percentile cannot see a cost carried by 2 % of frames. Frames-served can, because blocking the
 * main thread costs frames directly: the mutation above dropped the window from **479 to 425**
 * frames, and 54 lost frames at a 4.4 ms interval is 238 ms — the eight 30 ms stalls, recovered
 * almost exactly.
 *
 * Clean spread is **479 / 479 / 479** against **479 / 478 / 479**, one frame. Bounded at **1.02** —
 * ten times the observed noise, and the mutation clears it at 1.127.
 *
 * ⚠️ Its demonstrated floor: **`sound.play()` is so cheap that 500x the shipped call rate stayed
 * invisible.** This gate catches stalls, not call counts, and the QA log says so.
 */
export const MAX_AUDIO_FRAME_LOSS_RATIO = 1.02;

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
