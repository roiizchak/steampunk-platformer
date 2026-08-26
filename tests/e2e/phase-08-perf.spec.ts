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
 * ## The GPU bound: a PAIRED delta, and the record of getting it wrong twice
 *
 * `MAX_LEVEL_GPU_DELTA_MS` bounds `median(largeGpu[i] - smallGpu[i])` — level-05 minus level-01,
 * inside each pair. Full argument at the constant in `levelPerf.ts`. The short version is two
 * corrections, both of which this spec once carried as settled prose:
 *
 * 1. **Phase 8 shipped it as a RATIO of two unpaired medians-of-medians**, over samples that are
 *    already index-aligned pairs. Its clean reading swung **1.073 / 0.097 / 1.304** on three runs of
 *    one commit, the 0.097 coming from windows sitting on `gpuTimer`'s reporting floor, and
 *    `docs/qa/phase-08-levels.md` recorded it as red-proved when nothing had ever reddened it.
 * 2. 🔴 **On 2026-08-25 I DELETED it, and that was wrong.** The deletion rested on `skipCull` not
 *    moving the statistic — but `skipCull` cannot move a rasteriser-time statistic at all.
 *    `CullTiles.js:41-47` widens the cull bounds to the whole layer and `RunCull.js:47` drops only
 *    `index === -1`, so the extra ~1355 quads are submitted **entirely off-screen** and generate
 *    zero fragment work. The flat reading measured the mutation, not the instrument. Caught by both
 *    perf briefs of the §10a agent round and verified against the Phaser source before acting.
 *
 * The same runs had already shown the instrument is live: 60 full-screen alpha scrims ordered the
 * paired delta every time, per-pair, never overlapping clean. So the statistic works on the class of
 * cost the bound is about, the owner's pre-approved branch was rewrite-or-delete, and this is the
 * rewrite. The red proof below uses that amplifier — on the **Game** scene, so it lands in one arm
 * of the pair instead of cancelling in both — rather than a mutation whose cost the GPU never sees.
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

import { bootToGame } from './gameHarness';
import { MIN_GPU_SAMPLES, MIN_SAMPLES } from './perfBudget';
import type { Sample } from './perfSampler';
import { installGpuTimer } from './gpuTimer';
import { assertRealGpu } from './realGpu';
import {
  BLOAT_COPIES,
  MAX_LEVEL_CREATE_MS,
  MAX_LEVEL_CREATE_RATIO,
  MAX_LEVEL_GPU_DELTA_MS,
  MAX_LEVEL_WORK_MS,
  MAX_LEVEL_WORK_P95_MS,
  MAX_LEVEL_WORK_RATIO,
  PAIRS,
  PROGRESS_KEY,
  costLevelSize,
  installCreateTimer,
  median,
  medianPairedDelta,
  timeLevelCreation,
  sampleLevel,
  unlockAll,
} from './levelPerf';

test.describe('Phase 8 — criterion 8.7, the frame budget across the level ramp', () => {
  test('the largest level costs a bounded multiple of the smallest, per frame', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    const renderer = await assertRealGpu(page, '8.7');
    await installGpuTimer(page);

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
    const largeP95 = median(large.map((s) => s.workP95Ms));
    const gpuDelta = medianPairedDelta(
      small.map((s) => s.gpuMedianMs),
      large.map((s) => s.gpuMedianMs),
    );

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7] renderer ${renderer}\n` +
        `      level-01 (96x23, 16.9 % painted, 2 enemies) work median ${small
          .map((s) => s.workMedianMs.toFixed(2))
          .join(', ')} -> ${smallWork.toFixed(2)} ms\n` +
        `      level-05 (160x28, 31.8 % painted, 6 enemies) work median ${large
          .map((s) => s.workMedianMs.toFixed(2))
          .join(', ')} -> ${largeWork.toFixed(2)} ms\n` +
        `      ratio ${ratio.toFixed(2)}x against a bound of ${MAX_LEVEL_WORK_RATIO}x\n` +
        `      work p95    level-05 ${large.map((s) => s.workP95Ms.toFixed(2)).join(', ')} -> ` +
        `${largeP95.toFixed(2)} ms against ${MAX_LEVEL_WORK_P95_MS} ms\n` +
        `      gpu per pair  ${small
          .map((s, i) => (large[i]!.gpuMedianMs - s.gpuMedianMs).toFixed(4))
          .join(', ')} -> paired delta ${gpuDelta.toFixed(4)} ms against ${MAX_LEVEL_GPU_DELTA_MS} ms\n`,
    );

    // 🔴 The GPU timer is PRESENT and produced samples, asserted before the delta is read. Without the
    // extension `perfSampler` returns zeros, and zero minus zero is a delta of 0 — a bound satisfied
    // by having no measurement at all, which is this project's own most-repeated failure shape.
    for (const s of [...small, ...large]) {
      expect(s.gpuSupported, 'EXT_disjoint_timer_query_webgl2 is absent — nothing below is measured').toBe(true);
      // 🔴 `MIN_GPU_SAMPLES`, not `> 0`. The shared contract (`perfBudget.ts:188`) says 30 is the
      // fewest queries a GPU median may rest on; asserting `> 0` let ONE delayed query per arm
      // decide the bound. Named by the Codex implementation review.
      expect(s.gpuSamples, `the GPU median rests on ${s.gpuSamples} queries, under MIN_GPU_SAMPLES`)
        .toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);
    }
    // 🔴 **A one-sided upper bound treats an arm-specific timer collapse as an excellent result**,
    // and the QA record already contains one: a clean paired delta of −0.243 ms during the episode
    // that broke the old ratio. A large NEGATIVE delta does not mean level-05 is cheaper than
    // level-01 — it means one arm's median stopped being a measurement. Named by the Codex
    // implementation review. So the delta is bounded on BOTH sides, and the lower side is an
    // instrument-validity check, not a performance claim.
    expect(
      gpuDelta,
      `level-05 measured ${gpuDelta.toFixed(4)} ms LESS rasteriser time per frame than level-01. It ` +
        'paints 3.7x the tiles; a delta this negative is an arm-specific timer collapse, not a ' +
        'result — the bound above is measuring nothing.',
    ).toBeGreaterThan(-MAX_LEVEL_GPU_DELTA_MS);

    expect(
      gpuDelta,
      `level-05 costs ${gpuDelta.toFixed(4)} ms more rasteriser time per frame than level-01 ` +
        `(bound ${MAX_LEVEL_GPU_DELTA_MS} ms). The extra painted geometry has stopped being culled to ` +
        'the camera and started costing fill rate.',
    ).toBeLessThanOrEqual(MAX_LEVEL_GPU_DELTA_MS);

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

    /**
     * 🔴 And the tail, not just the middle. `SAMPLE_TICKS` is two sentry cooldowns precisely so every
     * window contains two synchronised volleys, and level-05 fires three sentries at once where
     * level-01 fires one. A median cannot report that frame; this is the assertion that can.
     */
    expect(
      largeP95,
      `level-05's 95th-percentile frame blocked for ${largeP95.toFixed(2)} ms — a one-in-twenty ` +
        'frame missing the 16.67 ms deadline on its own is a stutter the player sees, and the median ' +
        'above is blind to it by construction (the defect that killed 5.11’s MAX_BURST_RATIO).',
    ).toBeLessThanOrEqual(MAX_LEVEL_WORK_P95_MS);

    // 🔴 And the frames really were served. A window that drew nothing has a beautiful median.
    expect(median(large.map((s) => s.frames)), 'the large level served almost no frames').toBeGreaterThan(
      MIN_SAMPLES,
    );
  });


  /**
   * 🔴 The cost `sample()` structurally cannot see: BUILDING the level.
   *
   * `sample` starts timing at the first `requestAnimationFrame` after it is installed, and
   * `sampleLevel` settles for 60 ticks before that — so `drawLevelLayer`'s walk over every cell,
   * `GearLayer.create()` and `EnemyLayer.create()` have all finished before the first measured frame.
   * That walk is O(level AREA), which is the very quantity the steady-state ratio bound is a claim
   * about, and until this test existed criterion 8.7 never looked at it: a construction path that
   * went quadratic would have shipped with every bound above green. Named by the Phase 8
   * performance-engineer's adversarial brief.
   *
   * Interleaved and alternating, like the measurement above, and for the same reason.
   */
  test('building the largest level stays linear in its area, and quick enough not to read as a load', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    await assertRealGpu(page, '8.7-create');
    await installCreateTimer(page);

    const small: number[] = [];
    const large: number[] = [];
    for (let i = 0; i < PAIRS; i += 1) {
      if (i % 2 === 0) {
        small.push(await timeLevelCreation(page, 'level-01'));
        large.push(await timeLevelCreation(page, 'level-05'));
      } else {
        large.push(await timeLevelCreation(page, 'level-05'));
        small.push(await timeLevelCreation(page, 'level-01'));
      }
    }

    const smallMs = median(small);
    const largeMs = median(large);
    const ratio = largeMs / smallMs;

    // eslint-disable-next-line no-console
    console.log(
      `
[8.7 create] level-01 ${small.map((n) => n.toFixed(1)).join(', ')} -> ${smallMs.toFixed(1)} ms
` +
        `             level-05 ${large.map((n) => n.toFixed(1)).join(', ')} -> ${largeMs.toFixed(1)} ms
` +
        `             ratio ${ratio.toFixed(2)}x against ${MAX_LEVEL_CREATE_RATIO}x · absolute bound ` +
        `${MAX_LEVEL_CREATE_MS} ms
`,
    );

    // Non-vacuity: a zero would mean the poll resolved before anything was built.
    for (const ms of [...small, ...large]) expect(ms, 'a level was built in no time at all').toBeGreaterThan(0);

    expect(
      ratio,
      `building level-05 costs ${ratio.toFixed(2)}x level-01, against an AREA ratio of 2.03. ` +
        'Construction is allowed to scale with area — it walks every cell once — so a number near 2 ' +
        'is the expected shape and a number far above it means the walk is super-linear, which is ' +
        'what would make a sixth level unopenable.',
    ).toBeLessThanOrEqual(MAX_LEVEL_CREATE_RATIO);

    expect(
      largeMs,
      `level-05 took ${largeMs.toFixed(1)} ms to build. That is the pause between ENTER on the ` +
        'completion panel and the next level appearing, and past this it stops reading as a ' +
        'transition and starts reading as a load.',
    ).toBeLessThanOrEqual(MAX_LEVEL_CREATE_MS);
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
