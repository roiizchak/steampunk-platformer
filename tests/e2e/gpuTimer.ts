/**
 * The GPU timer — criterion 5.11's second blind spot, closed.
 *
 * ## Why this exists, and why two recorded reasons were wrong
 *
 * `phase-05-perf.spec.ts` measures **main-thread** time per frame: `performance.now() - frameStart`
 * at the top of a rAF callback registered after Phaser's. That is submission cost — `update()`, the
 * sim ticks, and the driver calls that hand work to the GPU. It is blind to what the GPU then *does*
 * with that work, so a change that draws vastly more pixels through the same number of calls is
 * invisible to it.
 *
 * Two places recorded that blind spot as unclosable, and both reasons were false:
 *
 *  - `phase-05-perf.spec.ts:50` — *"a GPU timer query, which is not reachable from here."*
 *  - `docs/qa/phase-05-combat.md` finding P1 — *"not reachable without a new dependency."*
 *
 * It is a **WebGL extension**, available from the page itself. No package is involved and the
 * frozen-dependency rule is untouched. A blind spot recorded with a wrong reason is worse than one
 * recorded with none, because the wrong reason is what stops the next person looking.
 *
 * ## 🔴 The extension is the WebGL **1** one, and the plan named the WebGL 2 one
 *
 * The session plan specified `EXT_disjoint_timer_query_webgl2`. Probed on this machine, Phaser's
 * context reports `WebGL 1.0 (OpenGL ES 2.0 Chromium)`, so that extension **cannot exist here** —
 * and had this been written from the plan it would have found nothing and been "correctly" skipped,
 * recording a second false unreachability on top of the first.
 *
 * What is present is `EXT_disjoint_timer_query`, the WebGL 1 sibling, with its own `*EXT` API
 * (`createQueryEXT` / `beginQueryEXT` / `getQueryObjectEXT`) rather than WebGL 2's `gl.createQuery`.
 * Measured on this box (RTX 4080 via ANGLE/D3D11): **64 counter bits, 27 samples in 30 frames, 0
 * disjoint, median 0.104 ms** — real numbers, not zeros.
 *
 * ⚠️ **There is no silent fallback between the two.** This asks for the WebGL 1 extension by name
 * and reports absence as absence. If the renderer is ever configured for WebGL 2 this must be
 * *changed*, deliberately, not quietly widened to try both — "try everything and use what sticks" is
 * how a gate ends up measuring something other than what it claims *(vault 1.3)*.
 *
 * ## 🔴 Bracketing: on Phaser's render events, and the measured reason it is not on rAF
 *
 * The obvious bracket is the sampler's own rAF callback — `endQueryEXT` at the top, `beginQueryEXT`
 * at the bottom, so the span covers the next frame's submission. **That was built first and it does
 * not measure what it claims.** The span from the bottom of callback N to the top of callback N+1 is
 * very nearly a whole frame interval, so it contains the GPU's **idle wait for vsync** as well as
 * its work, and `TIME_ELAPSED_EXT` on ANGLE/D3D11 does not always exclude that idle.
 *
 * It showed up as a **bimodal baseline across otherwise identical runs**:
 *
 * | run | baseline GPU median | ratio |
 * |---|---|---|
 * | 1 | 0.195 ms | 1.52x |
 * | 2 | 0.197 ms | 1.51x |
 * | 3 | **2.654 ms** | **0.13x** |
 *
 * A 13x swing in the *denominator*, and the dangerous direction: an inflated baseline makes a real
 * regression divide away to a small, passing ratio. A gate that can silently fail to catch is worse
 * than no gate.
 *
 * So the bracket is Phaser's own `prerender` / `postrender` events instead
 * (`node_modules/phaser/src/renderer/events/`), which fire immediately either side of the render
 * pass. The span then contains the frame's draw calls and nothing else — no inter-frame gap, no
 * vsync wait, and no dependence on where this module's callback sits relative to the game loop's.
 *
 * ## Disjoint frames are DISCARDED, never clamped
 *
 * `GPU_DISJOINT_EXT` reports that the GPU was interrupted — a context switch, a clock change — and
 * reading it resets it. A disjoint can corrupt **any** query overlapping it and there is no way to
 * tell which, so every in-flight query is dropped rather than kept or clamped. Keeping a disjoint
 * sample is how a real GPU regression hides inside a plausible-looking number.
 */

type Page = import('@playwright/test').Page;

/** How many queries may be in flight at once. Readback lags submission by a frame or two. */
export const GPU_RING_SIZE = 8;

/** Frames the drain may spend collecting in-flight results after the window closes. */
export const GPU_DRAIN_FRAMES = 8;

export interface GpuTiming {
  /** False when the extension is absent — asserted, never turned into a skip. */
  supported: boolean;
  /** Non-disjoint results collected. Below `MIN_GPU_SAMPLES` the median means nothing. */
  samples: number;
  /** Frames on which `GPU_DISJOINT_EXT` was set; every query in flight was dropped. */
  disjointFrames: number;
  medianMs: number;
  p95Ms: number;
  /** Queries still unread when the drain ran out. Non-zero is a readback that never landed. */
  abandoned: number;
}

/**
 * The in-page timer, installed on `window.__gpuTimer` for `perfSampler.sample()` to drive.
 *
 * Installed by `page.evaluate` **after** boot rather than `addInitScript` before it, because the
 * timer needs `__phaserGame.renderer.gl` — a context that does not exist until the game has booted.
 */
export async function installGpuTimer(page: Page): Promise<void> {
  await page.evaluate(
    ([ringSize, drainFrames]) => {
      const renderer = (
        window as unknown as {
          __phaserGame: {
            // The renderer IS the EventEmitter — probed: `renderer.events` does not exist on
            // Phaser 4's WebGLRenderer, but `renderer.on`/`_events` do.
            renderer: {
              gl?: WebGLRenderingContext;
              on?(e: string, fn: () => void): void;
            };
          };
        }
      ).__phaserGame.renderer;
      const gl = renderer.gl;

      // The WebGL 1 extension, by name. See this module's header: NOT the _webgl2 one, and
      // deliberately no fallback between them.
      const ext = gl ? (gl.getExtension('EXT_disjoint_timer_query') as GpuExt | null) : null;

      interface GpuExt {
        TIME_ELAPSED_EXT: number;
        GPU_DISJOINT_EXT: number;
        QUERY_RESULT_EXT: number;
        QUERY_RESULT_AVAILABLE_EXT: number;
        createQueryEXT(): object;
        deleteQueryEXT(q: object): void;
        beginQueryEXT(target: number, q: object): void;
        endQueryEXT(target: number): void;
        getQueryObjectEXT(q: object, pname: number): number | boolean;
      }

      const pending: object[] = [];
      const results: number[] = [];
      let open: object | null = null;
      let disjointFrames = 0;

      /** Only sample while a window is open, so idle frames between windows are not counted. */
      let armed = false;

      /** `prerender` — open a query immediately before the frame's draw calls. */
      const onPreRender = (): void => {
        if (!ext || !armed || open || pending.length >= ringSize) return;
        const q = ext.createQueryEXT();
        ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q);
        open = q;
      };

      /** `postrender` — close it immediately after, then drain whatever has become readable. */
      const onPostRender = (): void => {
        if (!ext || !gl) return;
        if (open) {
          ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
          pending.push(open);
          open = null;
        }
        // Read (and reset) the disjoint flag BEFORE harvesting: anything in flight across the
        // interruption is suspect, and there is no way to tell which. Drop them all.
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          disjointFrames += 1;
          for (const q of pending) ext.deleteQueryEXT(q);
          pending.length = 0;
          return;
        }
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          if (ext.getQueryObjectEXT(pending[i]!, ext.QUERY_RESULT_AVAILABLE_EXT)) {
            results.push(Number(ext.getQueryObjectEXT(pending[i]!, ext.QUERY_RESULT_EXT)));
            ext.deleteQueryEXT(pending[i]!);
            pending.splice(i, 1);
          }
        }
      };

      if (ext && typeof renderer.on === 'function') {
        renderer.on('prerender', onPreRender);
        renderer.on('postrender', onPostRender);
      }

      /** Called by `sample()` at the top and bottom of its window; the events do the timing. */
      const onFrameTop = (): void => { armed = true; };
      const onFrameBottom = (): void => { armed = true; };

      /**
       * Stop OPENING queries without closing the window, so the bounded drain reads back what the
       * window submitted and nothing more.
       *
       * 🔴 The drain used to re-arm on every one of its frames — `onFrameTop()` at the top of
       * `drain()` — so `prerender` opened a fresh query on each, and those frames' render cost
       * entered the median of a window that had already ended. Codex round 15, finding 5. It is a
       * SEPARATE entry point rather than a change to `finish()` because Phases 5-8 fixed their
       * bounds against the old behaviour: opting in leaves their numbers exactly where they were.
       */
      const stopSubmitting = (): void => { armed = false; };

      const finish = (): GpuTiming => {
        armed = false;
        if (ext) {
          if (open) {
            ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
            ext.deleteQueryEXT(open);
            open = null;
          }
          // Whatever never landed is abandoned rather than waited on — an undeleted pool would
          // leak into the second half of the interleaved pair.
          for (const q of pending) ext.deleteQueryEXT(q);
        }
        const abandoned = pending.length;
        pending.length = 0;
        const ms = results.map((ns) => ns / 1e6).sort((a, b) => a - b);
        // 🔴 **Reset for the next window.** `sample()` is called three times in one page — a warm-up,
        // the control, then the fleet — against ONE installed timer. Without this the accumulators
        // are cumulative: the control reported warm-up + control, and the fleet reported all three.
        //
        // It presented as an impossible number rather than a wrong-looking one: **1075 GPU samples
        // from 720 rAF frames**, at one query per frame. The ratio built on it read 0.38x — the
        // fleet apparently costing LESS GPU than the control — which is the direction that would
        // have made the gate silently unfailable.
        /**
         * 🔴 **Captured BEFORE the reset, fixed 2026-08-15 (Codex 5.14, major 4).** The reset ran
         * first and the returned object then read the already-zeroed variable, so **every report
         * claimed zero disjoint frames** regardless of what the driver actually signalled. The
         * discard logic was correct throughout — corrupted queries really were dropped — so the
         * numbers were sound; what was false was the evidence that they were sound. A gate whose
         * disjoint count is structurally 0 cannot warn anyone that its samples are being thrown away.
         */
        const disjointAtFinish = disjointFrames;
        results.length = 0;
        disjointFrames = 0;
        const at = (q: number): number =>
          ms.length ? ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]! : 0;
        return {
          supported: Boolean(ext),
          samples: ms.length,
          disjointFrames: disjointAtFinish,
          medianMs: at(0.5),
          p95Ms: at(0.95),
          abandoned,
        };
      };

      interface GpuTiming {
        supported: boolean;
        samples: number;
        disjointFrames: number;
        medianMs: number;
        p95Ms: number;
        abandoned: number;
      }

      (window as unknown as { __gpuTimer: unknown }).__gpuTimer = {
        supported: Boolean(ext),
        drainFrames,
        onFrameTop,
        onFrameBottom,
        stopSubmitting,
        finish,
      };
    },
    [GPU_RING_SIZE, GPU_DRAIN_FRAMES] as const,
  );
}
