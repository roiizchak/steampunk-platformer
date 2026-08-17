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

export interface Sample {
  /** rAF callbacks actually served across the tick window. */
  frames: number;
  /**
   * Sim ticks the window actually spanned. Both halves must span the same, or nothing compares.
   *
   * 🔴 **Corrected 2026-08-17. It was read AFTER the GPU drain, so it did not describe the same
   * span as `frames`.** `frames` is `work.length`, which stops counting the moment the tick
   * condition is met; `ticks` was then measured several rAF frames later, at the bottom of
   * `drain()`, and so included ticks that elapsed while nothing was being counted.
   *
   * That gap is invisible to every assertion phrased as a ratio of medians, and **fatal to one
   * phrased as a ratio of frame COUNTS** — which is what criterion 7.7's `MAX_AUDIO_FRAME_LOSS_RATIO`
   * is, and what criterion 5.11's replacement now is. Two windows that both satisfy
   * `ticks >= SAMPLE_TICKS` can span different numbers of ticks, so their raw frame counts are not
   * comparable and their difference reads as a stall that never happened.
   *
   * Now captured at the stop condition, beside `elapsedMs`, so `frames`, `ticks` and `elapsedMs`
   * all describe the identical window. Raised by the Codex plan review of 2026-08-17 (MAJOR 4).
   */
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

  /**
   * GPU time per frame, from `EXT_disjoint_timer_query` — the blind spot two documents recorded as
   * unreachable. Full argument in `gpuTimer.ts`.
   *
   * This is what `workMedianMs` structurally cannot see: a change that draws far more PIXELS through
   * the same number of draw calls costs the main thread nothing and the GPU a great deal.
   */
  gpuSupported: boolean;
  /** Non-disjoint results collected. Below `MIN_GPU_SAMPLES` a median is not a measurement. */
  gpuSamples: number;
  /** Frames where the GPU was interrupted; every query in flight was DROPPED, never clamped. */
  gpuDisjointFrames: number;
  gpuMedianMs: number;
  gpuP95Ms: number;
  /** Queries unread when the bounded drain expired. Non-zero means readback never landed. */
  gpuAbandoned: number;
}

/** The in-page handle `installGpuTimer` puts on `window.__gpuTimer`. */
interface GpuTimerHandle {
  supported: boolean;
  drainFrames: number;
  onFrameTop(): void;
  onFrameBottom(): void;
  finish(): {
    supported: boolean;
    samples: number;
    disjointFrames: number;
    medianMs: number;
    p95Ms: number;
    abandoned: number;
  };
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
 * directly.
 *
 * 🔴 **The invisible/zero-alpha half is CLOSED as of 2026-08-15, and it was the sharpest thing the
 * adversarial perf brief found.** It constructed the whole defect from live code: `enemyLayer.ts`
 * fades a dead body with `setAlpha(… ? 1 : 0.35)`, and a regression that made freshly-spawned fleet
 * bodies take that branch would draw all twenty at 35 % — or at 0 — for the entire sample window.
 * Every assertion in the spec would still pass, because they check body count, a creation-time
 * `isSprite` flag and a POSITION, none of which stop being true when nothing is visible. And a
 * transparent sprite is **cheaper to composite**, so both ratios would come in LOWER: a broken fleet
 * passing more comfortably than a correct one.
 *
 * That is not a hypothetical shape. This project has shipped it twice — grey-box Rectangles standing
 * in for Sprites made every perf number improve, and a death fade that started one frame early played
 * a whole ten-frame KO at 35 % opacity while the frame sampler *"happily reported 10 of 10 poses
 * painted, because they WERE painted, just barely visible"*. Vault 9.4: a measurement that is cheap
 * because the work is not really being done.
 *
 * So `alpha` and `visible` are now read per body and reported as `opaque` — bodies that are visible
 * AND at full alpha. The spec asserts that against the fleet size, which is the assertion neither
 * previous instance of this defect could have failed.
 */
export async function counts(page: Page): Promise<{
  bodies: number;
  sprites: number;
  inView: number;
  /** Visible AND fully opaque. See the alpha note above — this is the vault 9.4 guard. */
  opaque: number;
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
      enemies: {
        bodies: {
          x: number;
          y: number;
          alpha: number;
          willRender(camera: unknown): boolean;
        }[];
        isSprite: boolean[];
      };
      cameras: {
        main: { worldView: { x: number; y: number; width: number; height: number } };
      };
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
      /**
       * 🔴 **`willRender(camera)`, not `visible`, corrected 2026-08-15 (Codex 5.14, blocker 1).**
       *
       * The first fix tested `visible !== false && alpha >= 1`, which closes only the alpha branch.
       * Phaser excludes an object from rendering through `renderFlags`, and `setScale(0)` CLEARS the
       * transform render flag — so a fleet scaled to zero reports `visible: true`, `alpha: 1`, a
       * valid position and a `isSprite` flag, draws absolutely nothing, and makes both ratios
       * cheaper. Exactly the hole one layer down from the one that was closed.
       *
       * `willRender` is Phaser's own answer to "would this be drawn by this camera", so it tracks
       * every exclusion route the engine has rather than the two a reviewer happened to think of.
       */
      opaque: scene.enemies.bodies.filter(
        (b) => b.willRender(scene.cameras.main) && (b.alpha ?? 1) >= 1,
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
        // The GPU timer, installed on the window by `installGpuTimer`. Absent only if the caller
        // forgot to install it — which the `gpuSupported` assertion in the spec turns into a loud
        // failure rather than a silently missing measurement.
        const gpu = (window as unknown as { __gpuTimer?: GpuTimerHandle }).__gpuTimer;

        const step = (frameStart: number): void => {
          // TOP of the callback: close the query opened at the bottom of the previous one. The
          // span it just measured is Phaser's render submission for THIS frame — see gpuTimer.ts.
          gpu?.onFrameTop();
          work.push(performance.now() - frameStart);
          const live = (
            window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
          ).__phaserGame.scene.getScene('Game') as unknown as { world: { projectiles: unknown[] } };
          if (live.world.projectiles.length > maxProjectiles) {
            maxProjectiles = live.world.projectiles.length;
          }
          if (game.__game.tick - firstTick < wantTicks) {
            // BOTTOM: open the next frame's query. Only while the window is still running — once
            // the tick condition is met nothing further is submitted, so the drain below collects
            // in-flight results rather than chasing a moving tail.
            gpu?.onFrameBottom();
            requestAnimationFrame(step);
            return;
          }
          const elapsedMs = performance.now() - start;
          // Captured HERE, at the stop condition, not at the bottom of `drain()` below. `frames`
          // stopped counting on this frame, so the tick span has to be read on this frame too or
          // the two describe different windows — see the `ticks` docstring.
          const measuredTicks = game.__game.tick - firstTick;
          // Disconnect BEFORE resolving: an observer left attached keeps firing into the closure of
          // a finished window and would leak its entries into the second half of the pair.
          observer?.disconnect();
          const sorted = [...work].sort((a, b) => a - b);
          const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

          // 🔴 A **bounded** drain, never a wait-until-ready. GPU readback lags submission by a
          // frame or two, so resolving immediately would throw away the last few queries. Bounding
          // it means a driver that never signals fails the sample-count assertion loudly instead of
          // hanging the spec until Playwright's timeout, where it would look like a boot hang.
          let drained = 0;
          const drain = (): void => {
            gpu?.onFrameTop();
            if (drained < (gpu?.drainFrames ?? 0)) {
              drained += 1;
              requestAnimationFrame(drain);
              return;
            }
            const gpuTiming = gpu?.finish() ?? {
              supported: false, samples: 0, disjointFrames: 0, medianMs: 0, p95Ms: 0, abandoned: 0,
            };
            resolve({
              frames: work.length,
              ticks: measuredTicks,
              elapsedMs,
              intervalMs: elapsedMs / work.length,
              workMedianMs: at(0.5),
              workP95Ms: at(0.95),
              maxProjectiles,
              loafCount,
              blockingMs,
              loafSupported: supported,
              gpuSupported: gpuTiming.supported,
              gpuSamples: gpuTiming.samples,
              gpuDisjointFrames: gpuTiming.disjointFrames,
              gpuMedianMs: gpuTiming.medianMs,
              gpuP95Ms: gpuTiming.p95Ms,
              gpuAbandoned: gpuTiming.abandoned,
            });
          };
          drain();
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
