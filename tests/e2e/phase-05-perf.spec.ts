/**
 * Criterion 5.11 — *"frame budget under worst-case enemy count"* — rebuilt.
 *
 * ## What the old version measured, and why none of it counted
 *
 * It lived in `phase-05-combat.spec.ts`, pressed `N`, and reported the median **`requestAnimationFrame`
 * interval** over 90 frames against a 100 ms ceiling. Four separate things made that number mean
 * nothing, and every one of them is fixed here:
 *
 * | | old | now |
 * |---|---|---|
 * | **what ran it** | default headless Chromium — SwiftShader, a software rasteriser | a headed project on a GPU, **with the renderer string asserted** so a silent SwiftShader fallback fails instead of measuring |
 * | **what was drawn** | `DEV_FLEET_OFFSET_X` 200 sim px against a **160 sim px** visible half-width: **0 of 20** enemies on screen | the fleet spread symmetrically about the player, every body inside the view |
 * | **which enemies** | scavengers only | scavengers **and** sentries, alternating, with bolts in flight |
 * | **what was sampled** | rAF *interval* — how often the browser chose to call back | rAF *work*, from rAF's own frame-start timestamp (`long-animation-frame` is reported beside it and gates nothing — see `perfSampler.ts`) |
 *
 * HANDOFF §14 measured the first of those directly: the same scene reports **90.10 ms** headless and
 * **4.2 ms** on the real GPU, a factor of 21. A ceiling tuned against the first number is not a
 * budget, it is a hang detector wearing a budget's clothes — which is exactly what the old comment
 * admitted it was.
 *
 * ## Why the gate is a RATIO, and why the control runs in the same session
 *
 * ⚠️ **An absolute millisecond figure from this harness is uninterpretable** *(HANDOFF §14)*. The
 * machine, the GPU driver, whether Vite is still compiling, and whether anything else is on the box
 * all move it, and none of them are the thing 5.11 is about.
 *
 * So the measurement is **interleaved**: the identical sampler runs twice in one page, seconds
 * apart, first against the level's own 2 enemies and then against 22. Everything that would corrupt
 * an absolute number is present in *both* halves and divides out. What survives is the quantity the
 * criterion actually asks about — **what adding 20 enemies costs** — and that is expressed as a
 * ratio, which is unitless and travels between machines.
 *
 * This is not a loosened tolerance. It is a different measurement: *"change what it MEASURES, never
 * what it TOLERATES."*
 *
 * The instrument — what a sample is, how long a window lasts, why work and not interval — lives
 * in `perfSampler.ts` beside the code that implements it.
 *
 * ## ⚠️ What this gate is blind to — stated, because a gate's blind spots are part of its result
 *
 * Found by the criterion's own gate owner, and none of these are closable without either a new
 * dependency or a design decision. They are listed here rather than in a document because the next
 * person to trust this number will read this file.
 *
 *  - ~~**GPU work is invisible to it.**~~ ✅ **CLOSED 2026-08-14, and the recorded reason was wrong.**
 *    This said *"the honest closure is a GPU timer query, **which is not reachable from here**"*, and
 *    `docs/qa/phase-05-combat.md` finding P1 said *"not reachable **without a new dependency**"*.
 *    Both false: it is a **WebGL extension**, available from the page, no package involved. A blind
 *    spot recorded with a wrong reason is worse than one recorded with none — the wrong reason is
 *    what stops the next person looking. Now measured via `EXT_disjoint_timer_query` and gated as a
 *    ratio beside the main-thread one; see `gpuTimer.ts`.
 *  - **It measures steady state.** Bulk sprite creation for twenty bodies, and the near-simultaneous
 *    patrol→chase transition that follows a spawn inside `detectRadius`, both land in the gap
 *    between the two windows. That is deliberate — a one-off spawn spike is a different question
 *    from a frame budget — but it means this cannot see a `play()` storm.
 *  - **No enemy dies during the window.** The death animation, the alpha fade and the corpses that
 *    are never removed from the layer are all real draw states a long fight reaches and this fleet
 *    does not.
 *  - **`DEV_FLEET_COUNT` is a chosen multiple, not a bound.** Nothing in `src/sim/` or the level
 *    format caps concurrent enemies (recorded as finding S5), so "worst case" here means "ten times
 *    the shipped level", not "the most this engine can be asked to draw".
 *  - **The projectile it measures is a placeholder.** `enemyLayer` draws a bolt as `fillCircle`;
 *    the real renderer is unbuilt, so this baseline goes stale the day that art lands.
 */

import { expect, test } from '@playwright/test';
import { installGpuTimer } from './gpuTimer';
import {
  DEV_FLEET_COUNT,
  MAX_BURST_RATIO,
  MAX_GPU_RATIO,
  MAX_WORK_RATIO,
  MIN_GPU_SAMPLES,
  MIN_SAMPLES,
  SAMPLE_TICKS,
  SENTRY_COOLDOWN_TICKS,
} from './perfBudget';
import { SOFTWARE_RENDERERS, counts, sample, waitForBodyCount, webglRenderer } from './perfSampler';
import { bootToGame } from './gameHarness';

test.describe('Phase 5 — criterion 5.11, frame budget under the worst-case fleet', () => {
  test('adding 20 on-screen enemies does not cost more than a bounded multiple of the frame work', async ({
    page,
  }) => {
    await bootToGame(page);

    // 🔴 Before anything is measured: prove this is a GPU. `headless: false` and the GPU flags are a
    // REQUEST, and Chromium answers a refused request by falling back to SwiftShader — 21x slower
    // (HANDOFF §14) and the whole reason this spec has its own project. A number measured on a
    // software rasteriser is not a frame budget, and until now nothing checked.
    const renderer = (await webglRenderer(page)).toLowerCase();
    // eslint-disable-next-line no-console
    console.log(`[5.11] WebGL renderer: ${renderer}`);
    for (const software of SOFTWARE_RENDERERS) {
      expect(
        renderer,
        `this ran on "${renderer}", a SOFTWARE rasteriser. Every number below would be a ` +
          `measurement of the CPU drawing pixels, not of the frame budget. Do not soften this into ` +
          `a skip: the point of the chromium-gpu project is that the fallback is invisible.`,
      ).not.toContain(software);
    }

    const before = await counts(page);
    // The level's own enemies. Asserted, not assumed: if the baseline were empty the ratio below
    // would be measuring "some enemies vs no enemies", a different and much easier question.
    expect(before.bodies).toBeGreaterThan(0);

    // The GPU timer needs `__phaserGame.renderer.gl`, so it is installed after boot rather than as
    // an init script. Before the warm-up, so the warm-up exercises the same code path it will.
    await installGpuTimer(page);

    // 🔴 A discarded warm-up, and it is a correctness fix rather than politeness. The baseline is
    // sampled first, so without it the control runs on cold JIT while the fleet half runs on hot —
    // a bias that makes the ratio look BETTER than the truth, in the one direction a gate must not
    // be biased. One cooldown's worth of frames through the same code paths, thrown away.
    await sample(page, SENTRY_COOLDOWN_TICKS);

    // ---- half 1: the control, same page, same session, seconds before the other half ----------
    const baseline = await sample(page, SAMPLE_TICKS);
    // Reported, not gated — see the header. Asserted only so a silent loss of the API shows up as a
    // named fact rather than as two zeroes that look like a fast frame.
    expect(
      baseline.loafSupported,
      'long-animation-frame is unavailable in this browser, so the "frames over 50ms" half of the ' +
        'report below is silently absent. The gate itself does not depend on it.',
    ).toBe(true);
    expect(baseline.frames, 'the control window sampled too few frames').toBeGreaterThanOrEqual(MIN_SAMPLES);
    expect(baseline.ticks).toBeGreaterThanOrEqual(SAMPLE_TICKS);
    expect(baseline.elapsedMs).toBeGreaterThan(0);

    // 🔴 Three assertions that stop the GPU half becoming a second `long-animation-frame` — a gate
    // that reported 0/0 on both halves and therefore could not fail *(vault C2)*. Support, a real
    // denominator, and enough samples to have a median at all.
    expect(
      baseline.gpuSupported,
      'EXT_disjoint_timer_query is unavailable, so GPU cost is unmeasured. DO NOT soften this into ' +
        'a skip — the whole point is that this blind spot was recorded as unreachable twice and was ' +
        'reachable both times. If the renderer moved to WebGL 2, gpuTimer.ts must be updated to ask ' +
        'for EXT_disjoint_timer_query_webgl2 deliberately, not widened to try both.',
    ).toBe(true);
    expect(
      baseline.gpuMedianMs,
      'the control measured zero GPU time — the exact assertion long-animation-frame could not ' +
        'satisfy. A zero denominator makes every ratio below meaningless.',
    ).toBeGreaterThan(0);
    expect(
      baseline.gpuSamples,
      `only ${baseline.gpuSamples} non-disjoint GPU samples (${baseline.gpuDisjointFrames} frames ` +
        `were disjoint, ${baseline.gpuAbandoned} queries never read back). A median needs samples.`,
    ).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);

    // ---- the fleet ---------------------------------------------------------------------------
    await page.keyboard.press('n');
    await waitForBodyCount(page, before.bodies + DEV_FLEET_COUNT);
    const after = await counts(page);

    // The DELTA, not an absolute — the shipped level's own enemies satisfy an absolute count on
    // their own, and "fast because nothing new was drawn" is the failure this excludes (vault 9.4).
    expect(after.bodies - before.bodies).toBe(DEV_FLEET_COUNT);
    // Type before value. Without this, replacing all 20 with the cheaper Rectangle fallback still
    // satisfies the body count — and makes the frame budget look BETTER, so the render-path check
    // and the perf number must travel together.
    expect(typeof after.sprites).toBe('number');
    expect(after.sprites - before.sprites).toBe(DEV_FLEET_COUNT);

    // 🔴 **The assertion the whole rebuild is about**, and the one the old spec could not make:
    // every body the fleet added is inside the camera's own `worldView`, asked of the camera rather
    // than computed from a spread constant. The defect being replaced spawned all twenty 40 sim px
    // beyond the right edge and measured a frame that drew none of them.
    expect(
      after.inView - before.inView,
      `only ${after.inView - before.inView} of the ${DEV_FLEET_COUNT} spawned bodies are inside ` +
        `camera.worldView. The fleet is being simulated and culled, so the frame budget below ` +
        `would be measuring a frame that does not draw it — which is exactly the defect this spec ` +
        `was rebuilt to remove.`,
    ).toBe(DEV_FLEET_COUNT);

    // 🔴 Both kinds, and this is what the old fixture could not say. A scavenger-only fleet
    // exercises one sprite, one animation and no firing path.
    expect(after.scavengers - before.scavengers).toBeGreaterThan(0);
    expect(after.sentries - before.sentries).toBeGreaterThan(0);
    expect(after.scavengers - before.scavengers).toBe(DEV_FLEET_COUNT / 2);
    expect(after.sentries - before.sentries).toBe(DEV_FLEET_COUNT / 2);

    // ---- half 2: the same sampler, the same window length, 22 enemies -------------------------
    const fleet = await sample(page, SAMPLE_TICKS);
    expect(fleet.frames, 'the fleet window sampled too few frames').toBeGreaterThanOrEqual(MIN_SAMPLES);
    // Both halves must cover the same amount of GAME time, or the two medians are not comparable.
    expect(fleet.ticks).toBeGreaterThanOrEqual(SAMPLE_TICKS);

    const during = await counts(page);
    // The fleet was still there for the whole window. A sentry that killed the player would respawn
    // them at the level start, leaving the fleet off camera and the second half measuring an empty
    // screen — a false green that looks exactly like a fast one.
    expect(during.bodies, 'the fleet did not survive the sample window').toBe(after.bodies);
    expect(
      fleet.maxProjectiles,
      'no bolt was in flight on any frame of the sample — the projectile draw path was not measured',
    ).toBeGreaterThan(0);
    // The retyped cooldown, checked against the sim it mirrors. If `SENTRY.cooldown` moves, the
    // window above stops covering two volleys and this says so instead of quietly measuring one.
    expect(
      await page.evaluate(() => {
        const s = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as unknown as {
          world: { enemies: { sentries: { cooldown: number }[] } };
        };
        return s.world.enemies.sentries[0]?.cooldown ?? -1;
      }),
      'SENTRY.cooldown moved and SENTRY_COOLDOWN_TICKS in this file did not — the sample window is ' +
        'no longer guaranteed to contain two volleys',
    ).toBe(SENTRY_COOLDOWN_TICKS);

    // Non-vacuity, and it is the assertion that stops a zero from reading as "fast". A median of 0
    // means the sampler ran BEFORE the work each frame rather than after it, and every ratio built
    // on it would be meaningless.
    expect(
      baseline.workMedianMs,
      'the control measured no main-thread work at all — the sampler is not behind the game loop',
    ).toBeGreaterThan(0);

    const ratio = fleet.workMedianMs / baseline.workMedianMs;
    const burstRatio = fleet.workP95Ms / baseline.workP95Ms;
    const gpuRatio = fleet.gpuMedianMs / baseline.gpuMedianMs;
    const gpuBurstRatio = fleet.gpuP95Ms / baseline.gpuP95Ms;
    const report =
      `[5.11] ${SAMPLE_TICKS}-tick interleaved pair (>= 2 sentry volleys each), same page, real GPU.\n` +
      `       baseline ${before.bodies} bodies: work median ${baseline.workMedianMs.toFixed(2)}ms, ` +
      `p95 ${baseline.workP95Ms.toFixed(2)}ms over ${baseline.frames} frames / ${baseline.ticks} ticks, ` +
      `interval ${baseline.intervalMs.toFixed(2)}ms, ${baseline.loafCount} frames over 50ms\n` +
      `       fleet    ${after.bodies} bodies (${after.inView} in view): work median ` +
      `${fleet.workMedianMs.toFixed(2)}ms, p95 ${fleet.workP95Ms.toFixed(2)}ms over ${fleet.frames} ` +
      `frames / ${fleet.ticks} ticks, interval ${fleet.intervalMs.toFixed(2)}ms, ` +
      `${fleet.loafCount} frames over 50ms, peak ${fleet.maxProjectiles} bolts in flight\n` +
      `       ratios: median ${ratio.toFixed(2)}x, p95 ${burstRatio.toFixed(2)}x, ` +
      `for ${(after.bodies / before.bodies).toFixed(1)}x the enemies\n` +
      `       GPU: baseline median ${baseline.gpuMedianMs.toFixed(3)}ms / p95 ` +
      `${baseline.gpuP95Ms.toFixed(3)}ms over ${baseline.gpuSamples} samples ` +
      `(${baseline.gpuDisjointFrames} disjoint, ${baseline.gpuAbandoned} abandoned); fleet median ` +
      `${fleet.gpuMedianMs.toFixed(3)}ms / p95 ${fleet.gpuP95Ms.toFixed(3)}ms over ` +
      `${fleet.gpuSamples} samples (${fleet.gpuDisjointFrames} disjoint, ${fleet.gpuAbandoned} ` +
      `abandoned); ratios median ${gpuRatio.toFixed(2)}x, p95 ${gpuBurstRatio.toFixed(2)}x`;
    // eslint-disable-next-line no-console
    console.log(report);

    expect(
      ratio,
      `adding ${DEV_FLEET_COUNT} on-screen enemies multiplied per-frame main-thread work by ` +
        `${ratio.toFixed(2)}x against the control measured in the same page seconds earlier ` +
        `(${baseline.workMedianMs.toFixed(2)}ms -> ${fleet.workMedianMs.toFixed(2)}ms). That is ` +
        `superlinear in the enemy count, which is the shape of an O(n^2) sweep, a per-enemy texture ` +
        `upload or a per-frame allocation — not of drawing more sprites.`,
    ).toBeLessThan(MAX_WORK_RATIO);

    // 🔴 The burst half. A median cannot see a cost that lands on a few frames in hundreds, and the
    // synchronised ten-sentry volley is exactly that shape — so the assertion above, on its own,
    // would pass through the one event most likely to expose a per-enemy blow-up. The bound is
    // looser than the median's because a p95 is a noisier statistic, not because bursts matter less.
    expect(
      burstRatio,
      `the worst frames got ${burstRatio.toFixed(2)}x more expensive with ${DEV_FLEET_COUNT} more ` +
        `enemies (p95 ${baseline.workP95Ms.toFixed(2)}ms -> ${fleet.workP95Ms.toFixed(2)}ms) while ` +
        `the median moved only ${ratio.toFixed(2)}x. A cost that shows up in the tail and not the ` +
        `middle is a BURST — the ten sentries firing on the same tick, or a per-enemy allocation ` +
        `that only bites when they all act at once.`,
    ).toBeLessThan(MAX_BURST_RATIO);

    // 🔴 The GPU half — the blind spot two documents called unreachable. This is what the two
    // assertions above structurally cannot see: a regression that draws far more PIXELS through the
    // same number of draw calls costs the main thread nothing and the GPU a great deal. The proving
    // mutation is `enemyLayer.ts`'s `setFlipX(desc.flipX)` -> `setScale(4)`: identical draw-call
    // count, identical batch, one extra multiply on the main thread, 16x the fill per body.
    expect(
      gpuRatio,
      `adding ${DEV_FLEET_COUNT} on-screen enemies multiplied per-frame GPU time by ` +
        `${gpuRatio.toFixed(2)}x (${baseline.gpuMedianMs.toFixed(3)}ms -> ` +
        `${fleet.gpuMedianMs.toFixed(3)}ms) while main-thread work moved ${ratio.toFixed(2)}x. GPU ` +
        `cost growing far faster than submission cost is overdraw, alpha blending or a per-enemy ` +
        `render target — not drawing more sprites.`,
    ).toBeLessThan(MAX_GPU_RATIO);

    // ⚠️ **`gpuBurstRatio` is REPORTED and deliberately NOT asserted**, and the measurement is why.
    // Across three consecutive runs the GPU median was stable to ±3 % (2.18x, 2.12x, 2.12x) while
    // the p95 ratio swung **0.08x, 1.78x, 0.23x** — a 20x spread driven by occasional compositor
    // spikes in the *baseline* p95 (3.460ms, 0.147ms, 1.137ms), not by the fleet.
    //
    // A bound loose enough to survive that is loose enough to catch nothing, and a bound tight
    // enough to mean something would fail at random and train the next reader to dismiss a red run.
    // Same treatment, for the same reason, as `long-animation-frame` two assertions up: measured,
    // printed, gated by nothing, and said out loud rather than quietly dropped *(vault 9.3)*.
    expect(typeof gpuBurstRatio, 'the GPU p95 stopped being computed').toBe('number');
  });
});
