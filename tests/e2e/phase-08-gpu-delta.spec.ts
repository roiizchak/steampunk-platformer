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
 * The amplifier is `addGroundLayerCopies` — N more copies of the level's OWN ground layer, built
 * from the same `.tmj` and the same tileset, drawn over the real one. Three properties make it the
 * right one:
 *
 * - **It is the level's own painted tiles.** Every extra fragment is a tile fragment from the level
 *   under test, camera-culled exactly as the real layer is. 🔴 The first version of this proof used
 *   240 full-viewport alpha scrims, and the Codex implementation review was right to call that a
 *   convenient stand-in: it proves the timer can see extreme fill-rate work, not that a regression
 *   in level-05's tile geometry can cross the bound — which is what the bound claims.
 * - **It lands in ONE arm of the pair.** The layers go on the `Game` scene, which `sampleLevel`
 *   rebuilds per arm. `scrimMutation.ts`'s `addScrims` draws on `UI`, a parallel scene that survives
 *   every `scene.start`, so it would sit in both arms and cancel in the delta — the identical
 *   mistake criterion 7.7's first audio toggle made.
 * - **The instrument was already known live.** The 2026-08-25 runs measured 60 UI scrims ordering
  *   the paired delta on every pair, never overlapping clean, in the same session that `skipCull`
 *   read flat. So the instrument was live the whole time and only the mutation was wrong.
 * * ## It re-runs the SAME procedure as the bound
 *
 * Same `PAIRS`, same AB/BA interleave, same `medianPairedDelta`. A red proof measured more cheaply
 * than the bound it is about is not a proof of that bound — that lesson is `phase-08-perf.spec.ts`'s,
 * paid for there, and repeated here rather than re-learned.
 */

import { expect, test, type Page } from '@playwright/test';

import { bootToGame } from './gameHarness';
import { installGpuTimer } from './gpuTimer';
import { MIN_GPU_SAMPLES, MIN_SAMPLES } from './perfBudget';
import type { Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';
import {
  MAX_LEVEL_GPU_DELTA_MS,
  PAIRS,
  PROGRESS_KEY,
  medianPairedDelta,
  sampleLevel,
  unlockAll,
} from './levelPerf';
import { addGroundLayerCopies } from './levelAmplifiers';

/**
 * Extra copies of level-05's own ground layer, drawn over it.
 *
 * 🔴 **Not scrims, and the Codex implementation review is why.** The first version used 240
 * full-viewport alpha rectangles. Those prove the timer can see extreme fill-rate work; they do not
 * prove that a regression in *this level's tile geometry* can cross the bound, which is what
 * `MAX_LEVEL_GPU_DELTA_MS` actually claims. A bound red-proved by a stand-in is red-proved for a
 * different claim than the one it asserts.
 *
 * Each copy rasterises the SAME camera-culled painted cells the level already draws, so every extra
 * fragment is a tile fragment from the level under test.
 *
 * Measured, not guessed. Clean paired delta is 0.027-0.030 ms; the count below is the smallest that
 * put **every** pair over 0.5 ms with margin across two runs — see
 * `docs/qa/phase-08-levels-03-gpu-bound.md`. Deliberately not the smallest that reddens the median: a
 * red proof sitting on its bound flips with the weather, and this one has to be reliable enough that
 * a GREEN result means the gate is broken rather than the box is busy.
 */
const LAYER_COPIES = 40;

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
      added = await addGroundLayerCopies(p, LAYER_COPIES);
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
    // 🔴 The layers were ADDED. A `getScene` that returned a stale handle would add nothing and this
    // proof would read a flat delta as the bound failing to fire, when nothing was ever drawn.
    expect(added, `the amplifier added ${added} tilemap layers, not ${LAYER_COPIES}`).toBe(LAYER_COPIES);

    for (const s of [...small, ...large]) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(s.gpuSupported, 'EXT_disjoint_timer_query_webgl2 is absent — nothing here is measured').toBe(true);
      // 🔴 `MIN_GPU_SAMPLES`, not `> 0`. The shared contract (`perfBudget.ts:188`) says 30 is the
      // fewest queries a GPU median may rest on; asserting `> 0` let ONE delayed query per arm
      // decide the bound. Named by the Codex implementation review.
      expect(s.gpuSamples, `the GPU median rests on ${s.gpuSamples} queries, under MIN_GPU_SAMPLES`)
        .toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);
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
        `      level-05 + ${LAYER_COPIES} ground-layer copies gpu ${large.map((s) => s.gpuMedianMs.toFixed(4)).join(', ')}\n` +
        `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
        `${gpuDelta.toFixed(4)} ms against a bound of ${MAX_LEVEL_GPU_DELTA_MS} ms\n`,
    );

    expect(
      gpuDelta,
      `level-05 drawn with ${LAYER_COPIES} extra copies of its OWN ground layer measured only ` +
        `${gpuDelta.toFixed(4)} ms of extra rasteriser time per frame, against a bound of ` +
        `${MAX_LEVEL_GPU_DELTA_MS} ms. The GPU bound in phase-08-perf.spec.ts therefore cannot fail ` +
        'when its own painted tiles cost real fill rate, and it is decoration.',
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
