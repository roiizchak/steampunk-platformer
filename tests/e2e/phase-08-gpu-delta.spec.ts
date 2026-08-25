/**
 * **The red proof for criterion 8.7's GPU bound** — `MAX_LEVEL_GPU_DELTA_MS`, watched failing.
 *
 * ## Why it is its own file
 *
 * `phase-08-perf.spec.ts` reached 335 of 400 lines carrying the clean measurement and the *work*
 * ratio's red proof. This is a flat sibling, matched by the same `chromium-gpu` `testMatch` prefix
 * (`phase-08-[a-z0-9-]+`) and pinned to exactly one project by
 * `tests/unit/playwright-projects.test.ts`.
 *
 * ## The mutation, and why the previous one proved nothing
 *
 * 🔴 **The bound was deleted on 2026-08-25 on the strength of `skipCull` not moving it, and that was
 * a wrong conclusion.** `skipCull` cannot move a rasteriser-time statistic: `CullTiles.js:41-47`
 * widens the cull bounds to the whole layer and `RunCull.js:47` drops only tiles with
 * `index === -1`, so the ~1355 extra quads are submitted **entirely off-screen** and generate zero
 * fragment work. A GPU timer reading them as free is the timer being right. Both perf briefs of the
 * §10a agent round caught this; it was verified against the Phaser sources in `node_modules` before
 * the deletion was reverted.
 *
 * The amplifier here is `addGameScrims` — full-viewport alpha-blended rectangles, real fill-rate
 * cost with a real on-screen consequence. Two properties make it the right one:
 *
 * - **It lands in ONE arm of the pair.** They are drawn on the `Game` scene, which `sampleLevel`
 *   rebuilds per arm. `scrimMutation.ts`'s `addScrims` draws on `UI`, a parallel scene that survives
 *   every `scene.start`, so it would sit in both arms and cancel in the delta — the identical
 *   mistake criterion 7.7's first audio toggle made.
 * - **It was already shown to order this statistic.** The 2026-08-25 runs measured 60 scrims
 *   ordering the paired GPU delta on every pair, never overlapping clean, in the same session that
 *   `skipCull` read flat. So the instrument was live the whole time and only the mutation was wrong.
 *
 * ## It re-runs the SAME procedure as the bound
 *
 * Same `PAIRS`, same AB/BA interleave, same `medianPairedDelta`. A red proof measured more cheaply
 * than the bound it is about is not a proof of that bound — that lesson is `phase-08-perf.spec.ts`'s,
 * paid for there, and repeated here rather than re-learned.
 */

import { expect, test, type Page } from '@playwright/test';

import { bootToGame } from './gameHarness';
import { installGpuTimer } from './gpuTimer';
import { MIN_SAMPLES } from './perfBudget';
import type { Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';
import {
  MAX_LEVEL_GPU_DELTA_MS,
  PAIRS,
  PROGRESS_KEY,
  addGameScrims,
  medianPairedDelta,
  sampleLevel,
  unlockAll,
} from './levelPerf';

/**
 * Full-viewport alpha scrims drawn over level-05.
 *
 * Measured, not guessed, and **60 was tried first and rejected**: 60 Game-scene scrims read per-pair
 * 0.2703 / 1.8944 / 0.1495 ms — a clear 10x lift over the 0.027 ms clean delta, but two of the three
 * pairs landed UNDER the 0.5 ms bound and the proof reported green. (The earlier 0.8-1.1 ms figure
 * for 60 was measured on the UI scene, which draws over the whole viewport in both arms; the Game
 * scene is not the same amount of paint.)
 *
 * 240 reads 1.7797 / 1.9558 / 1.6476 — every pair over the bound, the worst by 3.3x, against a clean
 * paired delta of 0.027-0.030 across five runs. Deliberately NOT the smallest count that reddens: a
 * red proof sitting on its bound flips with the weather, and this one has to be reliable enough that
 * a GREEN result means the gate is broken rather than the box is busy.
 */
const SCRIMS = 240;

test.describe('Phase 8 — criterion 8.7, the GPU delta can go RED (vault C2)', () => {
  test('level-05 drawn with real fill-rate cost breaks the paired GPU bound', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    const renderer = await assertRealGpu(page, '8.7-gpu-redproof');
    await installGpuTimer(page);

    const small: Sample[] = [];
    const large: Sample[] = [];
    let added = -1;
    const mutate = async (p: Page): Promise<void> => {
      added = await addGameScrims(p, SCRIMS);
    };
    for (let i = 0; i < PAIRS; i += 1) {
      if (i % 2 === 0) {
        small.push(await sampleLevel(page, 'level-01'));
        large.push(await sampleLevel(page, 'level-05', mutate));
      } else {
        large.push(await sampleLevel(page, 'level-05', mutate));
        small.push(await sampleLevel(page, 'level-01'));
      }
    }

    // The premises, before the number that matters. A run with no GPU timer returns zeros, and
    // zero minus zero is a delta of 0 — which would report this proof PASSING its clean direction
    // while measuring nothing at all.
    // 🔴 The scrims were ADDED. A `getScene` that returned a stale handle would add nothing and this
    // proof would read a flat delta as the bound failing to fire, when nothing was ever drawn.
    expect(added, `the amplifier added ${added} display objects, not ${SCRIMS}`).toBe(SCRIMS);

    for (const s of [...small, ...large]) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(s.gpuSupported, 'EXT_disjoint_timer_query_webgl2 is absent — nothing here is measured').toBe(true);
      expect(s.gpuSamples, 'the GPU timer produced no samples').toBeGreaterThan(0);
    }

    const perPair = small.map((s, i) => large[i]!.gpuMedianMs - s.gpuMedianMs);
    const gpuDelta = medianPairedDelta(
      small.map((s) => s.gpuMedianMs),
      large.map((s) => s.gpuMedianMs),
    );

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7 gpu red proof] renderer ${renderer}\n` +
        `      level-01 gpu ${small.map((s) => s.gpuMedianMs.toFixed(4)).join(', ')}\n` +
        `      level-05 + ${SCRIMS} scrims gpu ${large.map((s) => s.gpuMedianMs.toFixed(4)).join(', ')}\n` +
        `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
        `${gpuDelta.toFixed(4)} ms against a bound of ${MAX_LEVEL_GPU_DELTA_MS} ms\n`,
    );

    expect(
      gpuDelta,
      `level-05 drawn with ${SCRIMS} full-viewport alpha scrims over it measured only ` +
        `${gpuDelta.toFixed(4)} ms of extra rasteriser time per frame, against a bound of ` +
        `${MAX_LEVEL_GPU_DELTA_MS} ms. The GPU bound in phase-08-perf.spec.ts therefore cannot fail ` +
        'on real fill-rate cost, and it is decoration.',
    ).toBeGreaterThan(MAX_LEVEL_GPU_DELTA_MS);

    // 🔴 Every pair, not just the median of them. A statistic that orders only on aggregate is one
    // whose red depends on which pairs happened to land where — the exact instability that made the
    // old ratio swing 13x on one commit.
    for (const [i, d] of perPair.entries()) {
      expect(d, `pair ${i} did not separate: ${d.toFixed(4)} ms`).toBeGreaterThan(0);
    }

    // The clean direction of this same comparison lives in `phase-08-perf.spec.ts`, which asserts the
    // delta is UNDER the bound with the identical procedure. Both directions, one bound, one session.
  });
});
