/**
 * The 5.11 sampler: everything that reaches INSIDE the page to measure a frame.
 *
 * Split out of `phase-05-perf.spec.ts` when that file crossed the 400-line rule, and the seam is a
 * real one rather than a line count. The spec states what criterion 5.11 asks and asserts it; this
 * file is the instrument — what a "sample" is, how long a window lasts, and how the numbers are read
 * out of a running Phaser scene. The instrument's correctness is argued here, once, beside the code
 * that implements it.
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
 * It is kept and reported, because "no frame in the window exceeded 50 ms" is a true and useful
 * thing to record. **Nothing is asserted on it.**
 *
 * What is asserted comes from rAF's own argument. **`requestAnimationFrame` hands the callback the
 * frame's start timestamp**, so `performance.now() - timestamp`, read at the top of a callback
 * registered *after* Phaser's, is the main-thread time that frame has already spent — `update()`,
 * the sim ticks inside it, and the whole render submission. It reports on every frame rather than
 * only slow ones, and it responds to the scene.
 *
 * The ordering is not assumed: `node_modules/phaser/src/dom/RequestAnimationFrame.js:95-103` shows
 * `step(time)` calling the game's callback and re-registering **afterwards**, so the game loop's
 * registration for frame N+1 always lands during frame N ahead of this sampler's.
 *
 * ## The window is bounded in TICKS, not frames
 *
 * 🔴 It was 120 rAF *frames*, and the criterion's adversarial gate owner showed why that could not
 * work. Every sentry starts ready to fire, so all ten dev sentries volley on the same tick and then
 * go silent for a full 90 ticks. At 240 Hz, 120 frames is **half a second** — a third of one
 * cooldown — so the synchronised volley, which is exactly the batched per-enemy cost an O(n^2)
 * sweep would show up in, could fall entirely outside the sampled window.
 *
 * Ticks are the right unit because the thing being caught recurs on a tick schedule, and because a
 * frame count means a different amount of game time on every display.
 */
import { BOOT_TIMEOUT } from './gameHarness';

type Page = import('@playwright/test').Page;

/** Mirrors `DEV_FLEET_COUNT` in `src/scenes/GameScene.ts` — a private const there, not exported. */
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

export interface Sample {
  /** rAF callbacks actually served across the tick window. */
  frames: number;
  /** Sim ticks the window actually spanned. Both halves must span the same, or nothing compares. */
  ticks: number;
  /** Wall-clock across the window. */
  elapsedMs: number;
  /** Mean rAF interval — CONTEXT ONLY. Never asserted on; see the header. */
  intervalMs: number;
  /** Median of `now - frameStart`: the frame's main-thread work. Gates the steady state. */
  workMedianMs: number;
  /**
   * 95th percentile of the same. **Gates the bursts**, and it has to: a synchronised sentry volley
   * is a handful of frames in hundreds, and a median is by construction blind to a minority of
   * expensive frames. This was computed and printed but asserted on nowhere until the adversarial
   * gate brief pointed out that the one frame capable of showing an O(n²) burst was being reported
   * to a human and gated by nothing.
   */
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

/**
 * Bodies drawn, sprites among them, sim enemies of each kind, bolts in flight — and **how many
 * bodies the camera can actually see** — in one read.
 *
 * 🔴 `inView` is here because the gate-owner review found the rebuild had replaced one arithmetic
 * assumption with another. `DEV_FLEET_SPREAD_SIM_PX = 288` is derived from a 1920 px view at
 * `RENDER_SCALE` 6 *assuming the camera is centred on the player* — which it is not when
 * `cameraRig`'s bounds clamp engages near a level edge. `level-01` spawns at x 624 of an 8640 px
 * level so the clamp does not engage today, and that is precisely the kind of "true by accident"
 * that stops being true when a level changes.
 *
 * It also narrows the standing blind spot recorded as finding T14: `isSprite` is a flag set once at
 * creation and never re-derived, so a body made invisible, zero-alpha or scrolled off-camera would
 * still be counted as a drawn Sprite — while making the frame *cheaper* and the ratio *easier* to
 * pass. Testing the drawn position against `camera.worldView` catches the off-camera half of that
 * directly. The invisible/zero-alpha half remains open and is stated in the assertions below.
 */
export async function counts(page: Page): Promise<{
  bodies: number;
  sprites: number;
  inView: number;
  sentries: number;
  scavengers: number;
  projectiles: number;
  hp: number;
}> {
  return page.evaluate(() => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scene: { getScene(k: string): unknown };
        };
      }
    ).__phaserGame;
    const scene = game.scene.getScene('Game') as unknown as {
      world: {
        player: { hp: number };
        enemies: { sentries: unknown[]; scavengers: unknown[] };
        projectiles: unknown[];
      };
      enemies: { bodies: { x: number; y: number }[]; isSprite: boolean[] };
      cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    };
    const view = scene.cameras.main.worldView;
    return {
      bodies: scene.enemies.bodies.length,
      sprites: scene.enemies.isSprite.filter(Boolean).length,
      inView: scene.enemies.bodies.filter(
        (b) =>
          b.x >= view.x &&
          b.x <= view.x + view.width &&
          b.y >= view.y &&
          b.y <= view.y + view.height,
      ).length,
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
export async function sample(page: Page, tickSpan: number): Promise<Sample> {
  return page.evaluate(
    (wantTicks) =>
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
        // The window is bounded in SIM TICKS, read off the live debug surface. `__game.tick` is the
        // simulation's own counter, so both halves cover the same amount of GAME time however fast
        // the display is — which is what makes "at least two sentry volleys per window" true rather
        // than hoped for.
        const game = window as unknown as { __game: { tick: number } };
        const firstTick = game.__game.tick;
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
          if (game.__game.tick - firstTick < wantTicks) {
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
            ticks: game.__game.tick - firstTick,
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
    tickSpan,
  );
}

/**
 * The WebGL renderer string the page is actually rendering with.
 *
 * 🔴 **The `chromium-gpu` project ASKS for a GPU; nothing checked it got one.** `headless: false`
 * plus `--enable-gpu-rasterization` is a request, and Chromium falls back to **SwiftShader** — a
 * CPU rasteriser — whenever the driver is unavailable, blocklisted, or the box has no display.
 * HANDOFF §14 measured that fallback at **21x** slower, which is the entire reason this spec exists
 * as a separate project. Declaring "a real GPU" in a docstring while a software renderer silently
 * served the numbers is the same class of unverified claim the rest of this rebuild removed.
 * Found by the Codex implementation review.
 *
 * Read through `WEBGL_debug_renderer_info` on the game's own context, so it is the renderer that
 * drew the frames being measured and not a second one made for the question.
 */
export async function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const game = (window as unknown as { __phaserGame: { renderer: { gl?: WebGLRenderingContext } } })
      .__phaserGame;
    const gl = game.renderer.gl;
    if (!gl) return 'no-webgl-context';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'no-debug-renderer-info';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
  });
}

/** Renderer names that mean the frames were rasterised on the CPU. Lower-cased before matching. */
export const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'software', 'microsoft basic render'];

/** Waits for the drawn body count to reach `target`. The growth path runs inside `sync()`. */
export async function waitForBodyCount(page: Page, target: number): Promise<void> {
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
