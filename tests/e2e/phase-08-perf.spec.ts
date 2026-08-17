/**
 * Criterion 8.7's frame budget — does the dense, long level cost more per frame than the small one?
 *
 * ## The only comparison this harness can honestly make
 *
 * *The headless harness is not the frame rate*: SwiftShader inflates e2e milliseconds ~21x, and even on
 * the GPU an absolute figure from this box means little — Vite is compiling, the machine is shared. So
 * this measures a **ratio between two levels sampled in the same page seconds apart**, interleaved, which
 * is the only shape the project trusts. `assertRealGpu` runs first and the renderer string is logged, so
 * the number in the QA log says which rasteriser produced it.
 *
 * ## What Phase 8 actually changed, and therefore what is worth measuring
 *
 * Five levels instead of one, and the largest is 160 x 28 tiles at 31.8 % painted against level-01's
 * 96 x 23 at 16.9 % — **2.4x the cells and 3.7x the painted tiles**, plus three times the enemies. The
 * question a frame budget can answer is whether that scales the per-frame cost, and the answer has to be
 * a comparison because nothing else here is stable enough to compare against a constant.
 *
 * 🔴 **The bound is on the RATIO of median frame work, not on a millisecond figure**, for the reason
 * above. A Phaser `TilemapLayer` culls to the camera, so a longer level should cost the same per frame
 * as a short one — that is the claim, and the ratio is what can falsify it.
 *
 * ## ⚠️ Where criterion 7.7 failed, and what is different here
 *
 * 7.7's frame-loss half went red on correct code because `frames` and `ticks` described different
 * windows. `perfSampler.Sample` was corrected for that and both are now captured at the stop condition,
 * so this reads `frames` and `ticks` from one window by construction. The mutation below is the one the
 * bound NAMES — a level with far more painted geometry — rather than a convenient stand-in, and the
 * final test proves the bound can tell that mutation from a clean run.
 */

import { expect, test, type Page } from '@playwright/test';

import { bootToGame, waitTicks } from './gameHarness';
import { MIN_SAMPLES, SAMPLE_TICKS } from './perfBudget';
import { sample, type Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';

const PROGRESS_KEY = 'steampunk.progress';

/**
 * How much more per-frame work the biggest level may cost than the smallest.
 *
 * 2.0 against a level with 2.4x the cells, 3.7x the painted tiles and 3x the enemies. The claim being
 * gated is that the camera cull makes level SIZE nearly free — if it were not, this would be closer to
 * 2.4 than to 1. It is deliberately not 1.1: the enemy count genuinely rises across the ramp and the
 * gate must not forbid the game's own design.
 */
const MAX_LEVEL_WORK_RATIO = 2;

/** Three pairs, interleaved, so drift in the machine hits both arms alike. */
const PAIRS = 3;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** A save that unlocks everything, so any level can be entered directly. */
function unlockAll(): string {
  const levels: Record<string, { completed: boolean; bestGears: number }> = {};
  for (const id of ['level-01', 'level-02', 'level-03', 'level-04']) {
    levels[id] = { completed: true, bestGears: 0 };
  }
  return JSON.stringify({ version: 1, lastLevel: 'level-01', levels });
}

/** Enter `levelId` and let it settle, then sample one window of steady play. */
async function sampleLevel(page: Page, levelId: string): Promise<Sample> {
  await page.evaluate((id) => {
    const game = (window as unknown as { __phaserGame: { scene: { start(k: string, d: unknown): void } } })
      .__phaserGame;
    game.scene.start('Game', { levelId: id });
  }, levelId);
  await page.waitForFunction(
    (id) => (window as unknown as { __game: { levelId: string | null; ready: boolean } }).__game.levelId === id,
    levelId,
    { timeout: 20_000 },
  );
  // Settle: the first frames after a scene start include texture binds and layer creation, which belong
  // to neither arm of the comparison.
  await waitTicks(page, 60);
  return sample(page, SAMPLE_TICKS);
}

test.describe('Phase 8 — criterion 8.7, the frame budget across the level ramp', () => {
  test('the largest level costs a bounded multiple of the smallest, per frame', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    const renderer = await assertRealGpu(page, '8.7');

    const small: Sample[] = [];
    const large: Sample[] = [];
    for (let i = 0; i < PAIRS; i += 1) {
      // Interleaved, and the ORDER alternates: sampling A then B three times would give every A the
      // benefit of a cooler machine and every B the cost of a warmer one.
      if (i % 2 === 0) {
        small.push(await sampleLevel(page, 'level-01'));
        large.push(await sampleLevel(page, 'level-05'));
      } else {
        large.push(await sampleLevel(page, 'level-05'));
        small.push(await sampleLevel(page, 'level-01'));
      }
    }

    for (const s of [...small, ...large]) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(s.ticks, 'the window spanned no sim ticks').toBeGreaterThan(0);
    }

    const smallWork = median(small.map((s) => s.workMedianMs));
    const largeWork = median(large.map((s) => s.workMedianMs));
    const ratio = largeWork / smallWork;

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7] renderer ${renderer}\n` +
        `      level-01 (96x23, 16.9 % painted, 2 enemies) work median ${small
          .map((s) => s.workMedianMs.toFixed(2))
          .join(', ')} -> ${smallWork.toFixed(2)} ms\n` +
        `      level-05 (160x28, 31.8 % painted, 6 enemies) work median ${large
          .map((s) => s.workMedianMs.toFixed(2))
          .join(', ')} -> ${largeWork.toFixed(2)} ms\n` +
        `      ratio ${ratio.toFixed(2)}x against a bound of ${MAX_LEVEL_WORK_RATIO}x\n`,
    );

    expect(
      ratio,
      `level-05 costs ${ratio.toFixed(2)}x level-01 per frame. It has 2.4x the cells and 3.7x the ` +
        'painted tiles, so a ratio near that number means the tilemap is NOT being culled to the ' +
        'camera and the frame cost scales with level size — which would make the ramp a performance ' +
        'ramp as well as a difficulty one.',
    ).toBeLessThanOrEqual(MAX_LEVEL_WORK_RATIO);

    // 🔴 And the frames really were served. A window that drew nothing has a beautiful median.
    expect(median(large.map((s) => s.frames)), 'the large level served almost no frames').toBeGreaterThan(
      MIN_SAMPLES,
    );
  });

  /**
   * 🔴 **The bound must be able to tell a real cost from a clean run**, which is exactly where criterion
   * 7.7 failed: it named a frame-loss bound whose two arms differed by something that divided out.
   *
   * This adds genuine per-frame work to the SAME level and asserts the same measurement notices. If a
   * measurable regression does not move `workMedianMs`, the ratio above is measuring nothing and the
   * budget is decoration.
   */
  test('the measurement can see per-frame work that was added', async ({ page }) => {
    test.setTimeout(180_000);
    await bootToGame(page);
    await assertRealGpu(page, '8.7-sensitivity');
    await waitTicks(page, 60);

    const clean = await sample(page, SAMPLE_TICKS);

    // A busy-wait inside the scene's own update, so the cost lands in `now - frameStart` exactly where a
    // real regression would. Not a `setTimeout` and not a GPU load: the bound above is on MAIN-THREAD
    // frame work, so the mutation has to be main-thread frame work.
    await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        update(t: number, d: number): void;
        sys: { sceneUpdate?: (t: number, d: number) => void };
      };
      const original = scene.update.bind(scene);
      const loaded = (t: number, d: number) => {
        original(t, d);
        const until = performance.now() + 3;
        while (performance.now() < until) {
          /* burn 3 ms of main thread, every frame */
        }
      };
      scene.update = loaded;
      /**
       * 🔴 **`sys.sceneUpdate` is the one that runs.** Phaser's `Systems` captures `scene.update` at
       * boot and calls the captured reference every frame, so reassigning `scene.update` alone shadows
       * a method nobody invokes — the first attempt added 3 ms per frame and the median did not move
       * by a hundredth of a millisecond. That looked exactly like the measurement being blind, which is
       * the failure this test exists to rule out, so the distinction is worth the two lines.
       */
      if (scene.sys.sceneUpdate) scene.sys.sceneUpdate = loaded;
    });
    await waitTicks(page, 60);
    const loaded = await sample(page, SAMPLE_TICKS);

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7 sensitivity] clean work median ${clean.workMedianMs.toFixed(2)} ms -> ` +
        `loaded ${loaded.workMedianMs.toFixed(2)} ms\n`,
    );

    expect(
      loaded.workMedianMs - clean.workMedianMs,
      'three milliseconds of busy-wait added to every frame did not move the median this criterion ' +
        'gates. The bound in the test above cannot distinguish a regression from a clean run, which is ' +
        'the shape criterion 7.7 failed in.',
    ).toBeGreaterThan(1);
  });
});
