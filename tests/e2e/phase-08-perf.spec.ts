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

/**
 * The **absolute** ceiling on the largest level's median main-thread work per frame, in milliseconds.
 *
 * 🔴 **A ratio alone is not a frame budget.** Any cost that lands in BOTH arms divides straight out of
 * `MAX_LEVEL_WORK_RATIO`, so a regression that made every level 30 ms per frame would leave the ratio
 * at 1.00 and this criterion green while the game ran at 30 fps. The Phase 8 performance-engineer gate
 * owner named it, and the project has already paid for it three times: `MAX_FLEET_WORK_MS`
 * (`perfBudget.ts`), `MAX_HUD_WORK_DELTA_MS` and `MAX_AUDIO_WORK_DELTA_MS` are the same repair applied
 * to criteria 5.11, 6.9 and 7.7 in turn.
 *
 * 8 ms — roughly half of a 60 Hz frame's 16.67 ms — matching `MAX_FLEET_WORK_MS` on the same box for
 * the same reason: level-05 measures **0.4 - 0.9 ms** clean here across repeated runs, so the bound
 * sits roughly ten times above the worst clean reading and cannot fail on driver noise, while still
 * catching the whole band a ratio is blind to.
 */
const MAX_LEVEL_WORK_MS = 8;

/**
 * How many off-map copies of the sim's swept geometry the mutation arm adds.
 *
 * Off-map (`x + 1e6`) on purpose: the copies are swept by `resolveCollisions`, `hazardHit` and
 * `collectGears` exactly as real geometry is, and by `GearLayer.sync()` every frame — which is the
 * cost that scales with level size and therefore the cost `MAX_LEVEL_WORK_RATIO` is a claim about —
 * but they can never touch the player, so the mutation changes the frame's cost and nothing else.
 */
const BLOAT_COPIES = 4000;

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

/**
 * Enter `levelId` and let it settle, then sample one window of steady play.
 *
 * `mutate` runs after the level is in and before the settle, because `scene.start` rebuilds the world
 * and the layer from the parsed file — anything applied before entry is thrown away, and a "loaded"
 * arm would quietly read clean.
 */
async function sampleLevel(page: Page, levelId: string, mutate?: (p: Page) => Promise<void>): Promise<Sample> {
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
  if (mutate) await mutate(page);
  // Settle: the first frames after a scene start include texture binds and layer creation, which belong
  // to neither arm of the comparison.
  await waitTicks(page, 60);
  return sample(page, SAMPLE_TICKS);
}

/**
 * The mutation criterion 8.7's bound NAMES: this level's size stops being free per frame.
 *
 * Two halves, because "level size costs per frame" has two mechanisms in this game and neither alone
 * clears the measurement noise on this box:
 *
 * - **the tilemap stops culling to the camera** — `skipCull` makes every cell in the level considered
 *   each frame instead of the ~220 on screen. This is the literal wording of the bound's failure
 *   message, and the whole reason a 2.4x-bigger level is expected to cost 1x.
 * - **the sim's per-tick sweeps grow with the level** — `resolveCollisions` scans `solids` twice a
 *   tick, `hazardHit` scans `hazards`, `collectGears` scans `gears`. The copies are parked at
 *   `x + 1e6 * i`, so they are swept exactly as real geometry is and can never touch the player: the
 *   mutation changes the frame's cost and nothing else about the run.
 */
async function costLevelSize(page: Page, copies: number): Promise<void> {
  await page.evaluate((n) => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      groundLayer: { skipCull: boolean };
      world: { solids: { x: number }[]; hazards: { x: number }[]; gears: { x: number }[] };
    };
    scene.groundLayer.skipCull = true;
    const bloat = <T extends { x: number }>(list: T[]): T[] => {
      const out = [...list];
      for (let i = 1; i <= n; i += 1) for (const item of list) out.push({ ...item, x: item.x + 1_000_000 * i });
      return out;
    };
    scene.world.solids = bloat(scene.world.solids);
    scene.world.hazards = bloat(scene.world.hazards);
    scene.world.gears = bloat(scene.world.gears);
  }, copies);
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

    // 🔴 And an ABSOLUTE ceiling beside the ratio, because a cost in both arms divides out of a ratio
    // and leaves it at 1.00. See `MAX_LEVEL_WORK_MS`.
    expect(
      largeWork,
      `level-05's median frame blocked the main thread for ${largeWork.toFixed(2)} ms out of the ` +
        '16.67 ms a 60 Hz frame has. The ratio above cannot see this: a regression that slowed every ' +
        'level equally divides out of it and leaves it at 1.00x.',
    ).toBeLessThanOrEqual(MAX_LEVEL_WORK_MS);
    expect(smallWork, 'level-01 alone exceeded the absolute budget').toBeLessThanOrEqual(MAX_LEVEL_WORK_MS);

    // 🔴 And the frames really were served. A window that drew nothing has a beautiful median.
    expect(median(large.map((s) => s.frames)), 'the large level served almost no frames').toBeGreaterThan(
      MIN_SAMPLES,
    );
  });

  /**
   * 🔴 **The RATIO must be able to go red on the mutation it names**, and it must stay green on a clean
   * run. Both halves, in one test, against one bound.
   *
   * The draft this replaces burned 3 ms of main thread inside `GameScene.update()` and asserted the
   * median moved. That proves `sample()` is not dead — a real thing to know, and the reason the
   * `sys.sceneUpdate` note below is kept — but it is **not** what criterion 8.7 needs. It never
   * computed a level-01-against-level-05 ratio under load, so nothing in the file showed that
   * `MAX_LEVEL_WORK_RATIO` could ever fail. That is the shape criterion 7.7 failed in, one level up:
   * a healthy-looking sensitivity check standing in for a red proof of the actual bound. Named by the
   * Phase 8 performance-engineer gate owner.
   *
   * ## It re-runs the SAME procedure, not a cheaper one
   *
   * 🔴 The first attempt took one sample of each arm and compared them. On this box a clean median is
   * **0.4 - 0.8 ms** and Chrome coarsens `performance.now()` to 0.1 ms, so a single-sample clean ratio
   * swung between **0.83x and 2.00x** across consecutive runs — a red proof that could fail on a clean
   * build proves nothing about the bound. The interleaving and the median-of-medians in the test above
   * exist precisely to average that out, so this repeats them exactly, with one variable changed. A red
   * proof measured more cheaply than the bound it is about is not a proof of that bound.
   */
  test('the ratio bound goes RED on a level whose size stops being free', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    await assertRealGpu(page, '8.7-redproof');

    const small: Sample[] = [];
    const large: Sample[] = [];
    const mutate = (p: Page) => costLevelSize(p, BLOAT_COPIES);
    for (let i = 0; i < PAIRS; i += 1) {
      if (i % 2 === 0) {
        small.push(await sampleLevel(page, 'level-01'));
        large.push(await sampleLevel(page, 'level-05', mutate));
      } else {
        large.push(await sampleLevel(page, 'level-05', mutate));
        small.push(await sampleLevel(page, 'level-01'));
      }
    }

    const smallWork = median(small.map((s) => s.workMedianMs));
    const largeWork = median(large.map((s) => s.workMedianMs));
    const ratio = largeWork / smallWork;

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7 red proof] level-01 clean ${smallWork.toFixed(2)} ms · level-05 unculled + ` +
        `${BLOAT_COPIES}x the swept geometry ${largeWork.toFixed(2)} ms · ratio ${ratio.toFixed(2)}x ` +
        `against a bound of ${MAX_LEVEL_WORK_RATIO}x\n`,
    );

    expect(
      ratio,
      'a level-05 that no longer culls its tilemap to the camera, and whose per-tick sweeps grew with ' +
        `its size, still measured ${ratio.toFixed(2)}x level-01. The bound in the test above therefore ` +
        'cannot fail on the very mutation it is written about, and 8.7’s frame budget is decoration.',
    ).toBeGreaterThan(MAX_LEVEL_WORK_RATIO);

    // 🔴 The discrimination: the clean run of this same comparison is in the test above, which asserts
    // the ratio is UNDER the bound with the identical procedure. Both directions, one bound, one
    // session *(vault C2)*. Repeating the clean half here would only add another noisy sample.
    expect(largeWork, 'the mutated arm did not measurably cost more').toBeGreaterThan(smallWork);

    /**
     * ⚠️ Kept from the draft this replaced, because it cost an hour: **`sys.sceneUpdate` is the
     * function that runs.** Phaser's `Systems` captures `scene.update` at boot and calls the captured
     * reference every frame, so a mutation that reassigns `scene.update` alone shadows a method nobody
     * invokes — 3 ms of busy-wait per frame moved the median by less than a hundredth of a
     * millisecond, which looked exactly like the measurement being blind. Anything that patches the
     * update loop here must set both.
     */
  });
});
