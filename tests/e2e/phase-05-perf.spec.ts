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
 * | **what ran it** | default headless Chromium — SwiftShader, a software rasteriser | a headed project with a real GPU (`playwright.config.ts`, `chromium-gpu`) |
 * | **what was drawn** | `DEV_FLEET_OFFSET_X` 200 sim px against a **160 sim px** visible half-width: **0 of 20** enemies on screen | the fleet spread symmetrically about the player, every body inside the view |
 * | **which enemies** | scavengers only | scavengers **and** sentries, alternating, with bolts in flight |
 * | **what was sampled** | rAF *interval* — how often the browser chose to call back | rAF *work*, from `PerformanceObserver`'s `long-animation-frame` |
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
 * ## Measuring work rather than interval, on every frame
 *
 * A rAF interval is a *scheduling* number. A browser that skips a frame reports a longer interval;
 * a throttled one reports longer intervals with no work at all; a background tab reports 1000 ms
 * and is doing nothing. It is also useless in the other direction: on this machine the game runs at
 * **4.16 ms** a frame — a 240 Hz display — and vsync pins the interval flat whatever the scene
 * costs, so a fleet that cost twice as much to draw would report the same interval.
 *
 * 🔴 **`long-animation-frame` was the first attempt and it cannot gate this.** LoAF only emits for
 * frames over **50 ms**. On the real GPU both halves reported **zero** entries and zero blocking
 * time, so the ratio was `0 / 0` and the gate could not be made to fail — decoration *(vault C2)*.
 * That measurement is kept and reported, because "no frame in the window exceeded 50 ms" is a true
 * and useful thing to record, but nothing is asserted on it.
 *
 * What is asserted comes from rAF's own argument. **`requestAnimationFrame` hands the callback the
 * frame's start timestamp**, so `performance.now() - timestamp`, read at the top of a callback
 * registered *after* Phaser's, is the main-thread time that frame has already spent — Phaser's
 * `update()`, the sim ticks inside it, and the whole render submission. That is the frame budget,
 * it is reported on every frame rather than only slow ones, and it responds to the scene.
 *
 * The ordering holds because rAF runs callbacks in registration order and both parties re-register
 * from inside their own callback: the sampler is registered after the game loop is already running,
 * so the game's re-registration for frame N+1 always happens during frame N before the sampler's.
 * `frames === SAMPLE_FRAMES` and a non-zero median are asserted so a sampler that never ran, or ran
 * ahead of the work it is measuring, cannot report a comfortable zero.
 */

import { expect, test } from '@playwright/test';
import { BOOT_TIMEOUT, bootToGame } from './gameHarness';

type Page = import('@playwright/test').Page;

/** Mirrors `DEV_FLEET_COUNT` in `src/scenes/GameScene.ts` — a private const there, not exported. */
const DEV_FLEET_COUNT = 20;

/**
 * How many rAF callbacks each half of the interleaved measurement runs for.
 *
 * A frame count, not a duration: it makes both halves do the same amount of *work sampling*
 * regardless of how fast the machine serves them, which is what keeps the ratio honest.
 */
const SAMPLE_FRAMES = 120;

/**
 * The ceiling on `fleet / baseline` blocking-time-per-frame.
 *
 * Set from the interleaved baseline recorded in `docs/qa/phase-05-combat.md`, rounded well clear of
 * it — it exists to catch a regression whose cost grows faster than the enemy count (an O(n²) sweep,
 * a per-enemy texture upload, a per-frame allocation storm), not to pin today's number. 11x the
 * enemies costing more than 4x the frame work is that shape of defect.
 */
const MAX_WORK_RATIO = 4;

interface Sample {
  /** rAF callbacks actually served. Equals `SAMPLE_FRAMES` or the window did not complete. */
  frames: number;
  /** Wall-clock across the window. */
  elapsedMs: number;
  /** Mean rAF interval — CONTEXT ONLY. Never asserted on; see the header. */
  intervalMs: number;
  /** Median of `now - frameStart`: the frame's main-thread work. **This is what gates.** */
  workMedianMs: number;
  /** 95th percentile of the same, so one long frame in twenty is visible beside the median. */
  workP95Ms: number;
  /**
   * The most bolts in flight on any frame of the window.
   *
   * A peak across the window, not a reading after it: bolts expire, and a single sample taken once
   * the sampling stopped can catch a gap between volleys and fail a run that measured them fine.
   */
  maxProjectiles: number;
  /** `long-animation-frame` entries observed. Reported, never asserted — see the header. */
  loafCount: number;
  /** Summed `blockingDuration` over those entries. Reported, never asserted. */
  blockingMs: number;
  /** False when the browser has no `long-animation-frame` support — asserted, never assumed. */
  loafSupported: boolean;
}

/** Bodies drawn, sprites among them, sim enemies of each kind, and bolts in flight — one read. */
async function counts(page: Page): Promise<{
  bodies: number;
  sprites: number;
  sentries: number;
  scavengers: number;
  projectiles: number;
  hp: number;
}> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      world: {
        player: { hp: number };
        enemies: { sentries: unknown[]; scavengers: unknown[] };
        projectiles: unknown[];
      };
      enemies: { bodies: unknown[]; isSprite: boolean[] };
    };
    return {
      bodies: scene.enemies.bodies.length,
      sprites: scene.enemies.isSprite.filter(Boolean).length,
      sentries: scene.world.enemies.sentries.length,
      scavengers: scene.world.enemies.scavengers.length,
      projectiles: scene.world.projectiles.length,
      hp: scene.world.player.hp,
    };
  });
}

/**
 * Run the sampler for `SAMPLE_FRAMES` rAF callbacks inside the page and return an aggregate.
 *
 * Everything is sampled and reduced **in the page** — a per-frame round trip to the test process
 * would itself be the slowest thing in the window, and a wait expressed in ticks cannot bound a
 * sampling window at all (this suite has produced a false green and a false red that way).
 */
async function sample(page: Page, frameTarget: number): Promise<Sample> {
  return page.evaluate(
    (frameCount) =>
      new Promise<Sample>((resolve) => {
        const supported =
          typeof PerformanceObserver !== 'undefined' &&
          (PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame');

        let loafCount = 0;
        let blockingMs = 0;
        let observer: PerformanceObserver | null = null;
        if (supported) {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const e = entry as PerformanceEntry & { blockingDuration?: number };
              loafCount += 1;
              blockingMs += e.blockingDuration ?? 0;
            }
          });
          // `buffered: false` — only frames inside this window count. A buffered replay would hand
          // the FIRST half of the interleaved pair every long frame from boot and asset decode,
          // which is the single largest stall in the run and belongs to neither half.
          observer.observe({ type: 'long-animation-frame', buffered: false });
        }

        const start = performance.now();
        const work: number[] = [];
        let maxProjectiles = 0;
        // 🔴 `frameStart` is rAF's own argument — the time the browser began this frame. Read at the
        // TOP of the callback, so `now - frameStart` is everything the main thread has already done
        // this frame: the game loop's `update()`, the sim ticks inside it, and the render
        // submission. The sampler registers after the game loop is running, and both re-register
        // from inside their own callbacks, so this one stays behind the work it is measuring.
        const step = (frameStart: number): void => {
          work.push(performance.now() - frameStart);
          const live = (
            window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
          ).__phaserGame.scene.getScene('Game') as unknown as { world: { projectiles: unknown[] } };
          if (live.world.projectiles.length > maxProjectiles) {
            maxProjectiles = live.world.projectiles.length;
          }
          if (work.length < frameCount) {
            requestAnimationFrame(step);
            return;
          }
          const elapsedMs = performance.now() - start;
          // Disconnect BEFORE resolving: an observer left attached keeps firing into the closure of
          // a finished window and would leak its entries into the second half of the pair.
          observer?.disconnect();
          const sorted = [...work].sort((a, b) => a - b);
          const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
          resolve({
            frames: work.length,
            elapsedMs,
            intervalMs: elapsedMs / work.length,
            workMedianMs: at(0.5),
            workP95Ms: at(0.95),
            maxProjectiles,
            loafCount,
            blockingMs,
            loafSupported: supported,
          });
        };
        requestAnimationFrame(step);
      }),
    frameTarget,
  );
}

/** Waits for the drawn body count to reach `target`. The growth path runs inside `sync()`. */
async function waitForBodyCount(page: Page, target: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { enemies: { bodies: unknown[] } };
      return scene.enemies.bodies.length >= n;
    },
    target,
    { timeout: BOOT_TIMEOUT },
  );
}

test.describe('Phase 5 — criterion 5.11, frame budget under the worst-case fleet', () => {
  test('adding 20 on-screen enemies does not cost more than a bounded multiple of the frame work', async ({
    page,
  }) => {
    await bootToGame(page);

    const before = await counts(page);
    // The level's own enemies. Asserted, not assumed: if the baseline were empty the ratio below
    // would be measuring "some enemies vs no enemies", a different and much easier question.
    expect(before.bodies).toBeGreaterThan(0);

    // ---- half 1: the control, same page, same session, seconds before the other half ----------
    const baseline = await sample(page, SAMPLE_FRAMES);
    // Reported, not gated — see the header. Asserted only so a silent loss of the API shows up as a
    // named fact rather than as two zeroes that look like a fast frame.
    expect(
      baseline.loafSupported,
      'long-animation-frame is unavailable in this browser, so the "frames over 50ms" half of the ' +
        'report below is silently absent. The gate itself does not depend on it.',
    ).toBe(true);
    expect(baseline.frames, 'the control window did not complete').toBe(SAMPLE_FRAMES);
    expect(baseline.elapsedMs).toBeGreaterThan(0);

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

    // 🔴 Both kinds, and this is what the old fixture could not say. A scavenger-only fleet
    // exercises one sprite, one animation and no firing path.
    expect(after.scavengers - before.scavengers).toBeGreaterThan(0);
    expect(after.sentries - before.sentries).toBeGreaterThan(0);
    expect(after.scavengers - before.scavengers).toBe(DEV_FLEET_COUNT / 2);
    expect(after.sentries - before.sentries).toBe(DEV_FLEET_COUNT / 2);

    // ---- half 2: the same sampler, the same window length, 22 enemies -------------------------
    const fleet = await sample(page, SAMPLE_FRAMES);
    expect(fleet.frames, 'the fleet window did not complete').toBe(SAMPLE_FRAMES);

    const during = await counts(page);
    // The fleet was still there for the whole window. A sentry that killed the player would respawn
    // them at the level start, leaving the fleet off camera and the second half measuring an empty
    // screen — a false green that looks exactly like a fast one.
    expect(during.bodies, 'the fleet did not survive the sample window').toBe(after.bodies);
    expect(
      fleet.maxProjectiles,
      'no bolt was in flight on any frame of the sample — the projectile draw path was not measured',
    ).toBeGreaterThan(0);

    // Non-vacuity, and it is the assertion that stops a zero from reading as "fast". A median of 0
    // means the sampler ran BEFORE the work each frame rather than after it, and every ratio built
    // on it would be meaningless.
    expect(
      baseline.workMedianMs,
      'the control measured no main-thread work at all — the sampler is not behind the game loop',
    ).toBeGreaterThan(0);

    const ratio = fleet.workMedianMs / baseline.workMedianMs;
    const report =
      `[5.11] ${SAMPLE_FRAMES}-frame interleaved pair, same page, real GPU.\n` +
      `       baseline ${before.bodies} bodies: work median ${baseline.workMedianMs.toFixed(2)}ms, ` +
      `p95 ${baseline.workP95Ms.toFixed(2)}ms, interval ${baseline.intervalMs.toFixed(2)}ms, ` +
      `${baseline.loafCount} frames over 50ms (${baseline.blockingMs.toFixed(1)}ms blocking)\n` +
      `       fleet    ${after.bodies} bodies: work median ${fleet.workMedianMs.toFixed(2)}ms, ` +
      `p95 ${fleet.workP95Ms.toFixed(2)}ms, interval ${fleet.intervalMs.toFixed(2)}ms, ` +
      `${fleet.loafCount} frames over 50ms (${fleet.blockingMs.toFixed(1)}ms blocking), ` +
      `peak ${fleet.maxProjectiles} bolts in flight\n` +
      `       work ratio ${ratio.toFixed(2)}x for ${(after.bodies / before.bodies).toFixed(1)}x the enemies`;
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
  });
});
