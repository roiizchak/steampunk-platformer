import { expect, test } from '@playwright/test';

import { TOUCH_IDS } from '../../src/render/touchLayout';
import { assertRealGpu } from './realGpu';
import {
  bootToTouchPlay,
  drawnFaces,
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
 * A percentile is blind to exactly the failure this phase could cause. The controls are ten DRAWN
 * objects and one non-drawing zone per control; if they cost anything it is a small, constant, per-frame cost —
 * and at ~240 fps against a 60 Hz sim, a p95 taken over the same window moved by 0.3 ms while a
 * 30 ms stall went unseen (the Phase 9 lesson). Frames served over a fixed wall-clock window counts
 * every frame, so a per-frame cost shows up as fewer of them.
 *
 * ## 🔴 What this bound CANNOT see — and it is enough to fail the criterion
 *
 * Both 12.11 briefs reached this independently and they are right. **Frames served against a
 * vsync-locked display cannot order its own mutation**, which by this project's own rule
 * (`TESTING-RULES.md`) means the statistic must be replaced rather than re-bounded.
 *
 * At 240 Hz the frame period is 4.1667 ms. A frame either makes its deadline or costs a whole
 * period, so served rate is `R / (1 + p)` for an overrunning fraction `p`, and red at 0.9 needs
 * **p ≥ 11.1 %**. A CONSTANT per-frame cost — which is exactly what fifteen extra display-list
 * entries are — never produces a partial `p`: below the headroom every frame makes it and the
 * ratio is 1.000; above it every frame misses and the ratio is 0.500. **Nothing lands between**,
 * so 0.60, 0.75 and 0.95 would all behave identically and the 10 % figure is not load-bearing.
 *
 * The invisible band is roughly **[0, 2.7 ms] of added per-frame cost**, and what the owner feels
 * at the top of it:
 *
 * | substrate | frame budget | 2.7 ms is | this gate says |
 * |---|---|---|---|
 * | this box, 240 Hz RTX 4080 | 4.167 ms | 65 % of it | 100.0 % |
 * | the owner's 60 Hz laptop | 16.667 ms | 16 % of it | 100.0 % |
 * | a mid-range phone | 16.667 ms | a hard drop to ~30 fps | 100.0 % |
 *
 * ⚠️ **And the phone is the substrate the controls SHIP to.** They render only when Phaser detects
 * touch, so this gate runs on the one platform the feature is absent from. Under `Scale.FIT` a
 * phone rasterises the full 1920x1080 backing store every frame and downscales it, on a GPU an
 * order of magnitude slower. There is no mobile timing evidence anywhere in this repo.
 *
 * ⚠️ **The two arms also share a GPU.** Both contexts stay alive and rendering for the whole run
 * (Playwright ships `--disable-backgrounding-occluded-windows`), so total system load is
 * `2·base + C` in both samples. If the shared GPU is the binding resource, C divides out exactly —
 * *an A/B toggle bounds only what differs between the arms*.
 *
 * **So 12.11 is recorded NOT MET, not quietly re-bounded.** The replacement this repo already ships
 * is `tests/e2e/gpuTimer.ts`'s `installGpuTimer` with a paired ABSOLUTE per-frame delta in
 * milliseconds against a 16.667 ms budget — the shape of `phase-08-gpu-delta.spec.ts`, which was
 * red-proved on a held-out set. What remains below is still worth running: it catches a dropped
 * frame and a collapsed baseline, and its preconditions are real. It is not the criterion.
 *
 * ## The precondition that makes the arms mean anything
 *
 * 🔴 The touch arm asserts **every control is drawn and interactive** before timing starts.
 * Without it, a build where the controls silently failed to appear would report the budget
 * unregressed for the most persuasive possible wrong reason.
 *
 * ⚠️ **This spec does NOT gate `chromium-touch-gpu`'s `hasTouch`, and an earlier version of this
 * comment claimed it did.** M13 dropped `hasTouch: true` from the project's `use` block and this
 * spec stayed **green** — because the two arms below are built here, from
 * `browser.newContext({ hasTouch })`, so the project's value never reaches either of them. What
 * gates it is `tests/unit/playwright-projects.test.ts`, which reads the `use` blocks directly. The
 * precondition above is still load-bearing; it just answers a different question than the config.
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
      TOUCH_IDS.length,
    );
    // 🔴 Zones are HITTABILITY. A `Zone` renders nothing — `touchMeasure.ts` says so in as many
    // words — so the assertion above cannot tell a drawn arm from an undrawn one. Delete the
    // `setVisible(wanted)` loop in `refresh()` and every zone is still there and still
    // interactive, while the timed arm draws zero extra pixels: the criterion's own named failure
    // mode, passing its own precondition. The pixels are the FACES. Found by both 12.11 briefs.
    //
    // ⚠️ **This was `> drawn.length` and the adopted art broke it, correctly.** The grey box drew a
    // plate plus several marks per control, so "more faces than zones" happened to hold; one
    // generated image per control makes the two counts EQUAL, and the bound false-redded a build
    // that draws strictly better pixels. The claim was never about a ratio — it is *every control
    // has something visible* — so it is asserted per control, by name, which the count could not do
    // either: six visible faces all belonging to one plate passed the old form.
    const visibleFaces = (await drawnFaces(withControls, 'UI')).filter((f) => f.visible);
    const facesFor = new Set(visibleFaces.map((f) => f.name));
    for (const id of TOUCH_IDS) {
      expect(
        facesFor.has(id),
        `${id} has a hit area and nothing drawn — the timed arm would draw an empty frame there`,
      ).toBe(true);
    }
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
    // 🔴 An ABSOLUTE floor as well as a ratio. A ratio alone has no baseline: halve the frame
    // rate in BOTH arms — anything in `UIScene.update()`, the renderer, an asset — and the
    // ratio stays 1.0 while the gate is green at 30 fps. Phase 7's G32 finding is the same
    // failure: `audioCues` left in both arms moved the median 2 ms in each and the delta stayed
    // 0.000. 50 fps clears any 60 Hz display with room and catches a collapse.
    expect(
      withoutFps,
      `the control arm itself served only ${withoutFps.toFixed(1)} frames/s — the baseline has ` +
        'collapsed, so the ratio below is a comparison of two broken runs',
    ).toBeGreaterThan(50);
    expect(
      withFps,
      `the controls cost ${(100 - (withFps / withoutFps) * 100).toFixed(1)}% of the frame rate`,
    ).toBeGreaterThan(withoutFps * 0.9);
  } finally {
    await touchContext.close();
    await plainContext.close();
  }
});
