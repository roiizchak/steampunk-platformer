import { expect, test } from '@playwright/test';

import { assertRealGpu } from './realGpu';
import {
  bootToTouchPlay,
  drawnZones,
  installTouchDriver,
} from './touchHarness';

/**
 * **Criterion 12.11 — the frame budget with the controls drawn.**
 *
 * ⚠️ **The headless harness is not the frame rate.** HANDOFF §14 measured the same scene at 90.10 ms
 * headless against 4.2 ms on the real GPU — a factor of 21 — so this spec runs in
 * `chromium-touch-gpu` (headed, GPU flags, `hasTouch`) and calls `assertRealGpu` before taking a
 * single number. A refused GPU request falls back to SwiftShader **silently**.
 *
 * ⚠️ **Only same-session interleaved A/Bs decide a performance question.** An absolute millisecond
 * figure from this harness means little: Vite is still compiling, the box is shared. So the two arms
 * are sampled A, B, A, B, A, B in one run of one spec, and the comparison is between their medians.
 *
 * ## The statistic is FRAMES SERVED, not a percentile
 *
 * A percentile is blind to exactly the failure this phase could cause. The controls are fifteen extra
 * objects submitted every frame; if they cost anything it is a small, constant, *every-frame* cost —
 * and at ~240 fps against a 60 Hz sim, a p95 taken over the same window moved by 0.3 ms while a
 * 30 ms stall went unseen (the Phase 9 lesson). Frames served over a fixed wall-clock window counts
 * every frame, so a per-frame cost shows up as fewer of them.
 *
 * ## ⚠️ What this bound CANNOT see, recorded rather than glossed
 *
 * Both arms run at the display refresh — measured 240.0 against 240.2 frames/s on an RTX 4080. At
 * the vsync ceiling, frames served is insensitive to any per-frame cost smaller than the ~4.2 ms of
 * headroom a 240 Hz frame has. So this criterion answers *"do the controls cost a frame?"* and NOT
 * *"do they cost 0.2 ms?"*. That is the question the criterion asks, and the honest limit of the
 * statistic that answers it — a smaller claim needs a GPU timer, which is `gpuTimer.ts` and a
 * different criterion.
 *
 * ## The precondition that makes the arms mean anything
 *
 * 🔴 The touch arm asserts **all five controls are drawn and interactive** before timing starts.
 * Without it, a build where the controls silently failed to appear would report the budget
 * unregressed for the most persuasive possible wrong reason — and `hasTouch` missing from this
 * project's `use` block is exactly how that would happen.
 */

/** Long enough to average out a compile hiccup, short enough that six of them fit in a test. */
const WINDOW_MS = 2500;
/** Three of each arm, interleaved. Enough for a median to mean something without a long run. */
const ROUNDS = 3;

interface Sample {
  frames: number;
  ms: number;
  ticks: number;
}

/** Count animation frames actually served over a wall-clock window, inside the page. */
async function sampleFrames(page: import('@playwright/test').Page, ms: number): Promise<Sample> {
  return page.evaluate(
    (windowMs) =>
      new Promise<Sample>((resolve) => {
        const startTick = window.__game?.tick ?? 0;
        const start = performance.now();
        let frames = 0;
        const step = (): void => {
          frames += 1;
          const elapsed = performance.now() - start;
          if (elapsed >= windowMs) {
            resolve({ frames, ms: elapsed, ticks: (window.__game?.tick ?? 0) - startTick });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

test('12.11 the frame budget is unregressed with the controls drawn', async ({ browser }) => {
  test.setTimeout(180_000);

  const touchContext = await browser.newContext({ hasTouch: true });
  const plainContext = await browser.newContext({ hasTouch: false });
  try {
    const withControls = await touchContext.newPage();
    const without = await plainContext.newPage();
    await installTouchDriver(withControls);
    await installTouchDriver(without);

    await bootToTouchPlay(withControls);
    await bootToTouchPlay(without);

    await assertRealGpu(withControls, '12.11 controls');
    await assertRealGpu(without, '12.11 control arm');

    // 🔴 The precondition. Time nothing until the thing being measured is on screen.
    const drawn = await drawnZones(withControls, 'UI');
    expect(drawn.length, 'the touch arm has no controls, so it is not the arm it claims to be').toBe(
      5,
    );
    for (const z of drawn) {
      expect(z.interactive, `${z.name} is not live in the timed arm`).toBe(true);
    }
    expect(
      await drawnZones(without, 'UI'),
      'the control arm has touch controls, so the two arms are the same arm',
    ).toEqual([]);

    const controlsArm: number[] = [];
    const bareArm: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      // Interleaved, always in this order, so a machine that warms up or cools down over the run
      // moves both arms together rather than one of them.
      const a = await sampleFrames(withControls, WINDOW_MS);
      const b = await sampleFrames(without, WINDOW_MS);

      expect(typeof a.frames).toBe('number');
      expect(a.frames, 'the touch arm served no frames at all').toBeGreaterThan(0);
      expect(b.frames, 'the control arm served no frames at all').toBeGreaterThan(0);
      // A page that stopped ticking is not a page whose frame budget can be compared.
      expect(a.ticks, 'the simulation stopped in the touch arm').toBeGreaterThan(0);
      expect(b.ticks, 'the simulation stopped in the control arm').toBeGreaterThan(0);

      controlsArm.push((a.frames / a.ms) * 1000);
      bareArm.push((b.frames / b.ms) * 1000);
    }

    const withFps = median(controlsArm);
    const withoutFps = median(bareArm);
    // eslint-disable-next-line no-console
    console.log(
      `[12.11] frames/s median — with controls ${withFps.toFixed(1)}, without ${withoutFps.toFixed(1)}` +
        ` (${((withFps / withoutFps) * 100).toFixed(1)}% of the control arm)`,
    );

    // 10 % is the room this bound allows, chosen against the cost of the thing being added: fifteen
    // objects on a display list that already carries a HUD. A regression that mattered — a per-frame
    // layout recomputation, a re-created hit area — would cost far more than that, and anything under
    // it is inside the run-to-run spread of a shared box.
    expect(
      withFps,
      `the controls cost ${(100 - (withFps / withoutFps) * 100).toFixed(1)}% of the frame rate`,
    ).toBeGreaterThan(withoutFps * 0.9);
  } finally {
    await touchContext.close();
    await plainContext.close();
  }
});
