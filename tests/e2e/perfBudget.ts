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
