/**
 * **The red proof for `MAX_LEVEL_WORK_P95_MS`** — criterion 8.7's one bound that had none.
 *
 * ## Why this file exists
 *
 * Phase 8 shipped seven frame bounds and its QA log recorded *"every bound red-proved."* That was
 * false twice over: the GPU ratio never had one (it does now), and **this bound still did not**. The
 * §10a agent round found the blanket claim; the Codex implementation review then made the sharper
 * point — a gate the record itself admits has no red proof is a gate nobody has shown to work, and
 * *(C2)* says that is decoration whatever the run says.
 *
 * ## The mutation, and why it isolates
 *
 * `installFrameSpike` burns ~24 ms on one animation frame in ten, on the level-05 arm only, charged
 * to the frame AFTER the sample so the spike is not measuring itself.
 *
 * 🔴 **The other three frame bounds are MEDIANS**, and a cost paid on one frame in ten is invisible
 * to a median — which is the entire reason `workP95Ms` is computed as a separate statistic. So this
 * mutation reddens the p95 and leaves `MAX_LEVEL_WORK_RATIO`, `MAX_LEVEL_WORK_MS` and
 * `MAX_LEVEL_GPU_DELTA_MS` alone. That is what makes the red **attributable** — the property
 * `MAX_PER_PARTICLE_WORK_MS` was recorded as unable to have, and the reason `p95spike` exists in
 * `phase-09-perf.spec.ts` for the same statistic one phase over.
 *
 * ⚠️ The clean direction of this comparison lives in `phase-08-perf.spec.ts`, which asserts the p95 is
 * UNDER the bound with the same sampler. Both directions, one bound, one session.
 */

import { expect, test } from '@playwright/test';

import { bootToGame } from './gameHarness';
import { frameSpikesFired, installFrameSpike } from './levelAmplifiers';
import { MIN_SAMPLES } from './perfBudget';
import type { Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';
import {
  MAX_LEVEL_WORK_MS,
  MAX_LEVEL_WORK_P95_MS,
  MAX_LEVEL_WORK_RATIO,
  PAIRS,
  PROGRESS_KEY,
  median,
  sampleLevel,
  unlockAll,
} from './levelPerf';

/**
 * The spike, in milliseconds, and its duty cycle.
 *
 * 24 ms is one and a half 60 Hz frames — comfortably over the 16 ms bound with margin for the
 * clock's 0.1 ms grid, and deliberately not 16.1: a red proof sitting on its bound flips with the
 * weather. One frame in ten keeps it out of the median by construction, and the whole cost added
 * across a sample window is a few hundred milliseconds, orders of magnitude inside any stall guard.
 */
const SPIKE_MS = 24;
const SPIKE_EVERY = 10;

test.describe('Phase 8 — criterion 8.7, the work p95 can go RED (vault C2)', () => {
  test('a one-in-ten frame spike breaks the p95 bound and NOTHING else', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PROGRESS_KEY, unlockAll()] as const,
    );
    await bootToGame(page);
    const renderer = await assertRealGpu(page, '8.7-p95-redproof');

    const small: Sample[] = [];
    const large: Sample[] = [];
    const mutate = (p: typeof page) => installFrameSpike(p, SPIKE_MS, SPIKE_EVERY, 'level-05');
    for (let i = 0; i < PAIRS; i += 1) {
      if (i % 2 === 0) {
        small.push(await sampleLevel(page, 'level-01'));
        large.push(await sampleLevel(page, 'level-05', mutate));
      } else {
        large.push(await sampleLevel(page, 'level-05', mutate));
        small.push(await sampleLevel(page, 'level-01'));
      }
    }

    // 🔴 The spike actually BURNED. A hook that was installed and never fired produces the same
    // green as a bound that cannot fire, and the whole point of this file is telling those apart.
    const fired = await frameSpikesFired(page);
    expect(fired, 'the frame spike hook never ran — nothing below measures anything').toBeGreaterThan(50);

    for (const s of [...small, ...large]) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
    }

    const smallWork = median(small.map((s) => s.workMedianMs));
    const largeWork = median(large.map((s) => s.workMedianMs));
    const largeP95 = median(large.map((s) => s.workP95Ms));

    // eslint-disable-next-line no-console
    console.log(
      `\n[8.7 p95 red proof] renderer ${renderer} · ${fired} spikes of ${SPIKE_MS} ms burned\n` +
        `      level-05 p95 ${large.map((s) => s.workP95Ms.toFixed(2)).join(', ')} -> ` +
        `${largeP95.toFixed(2)} ms against a bound of ${MAX_LEVEL_WORK_P95_MS} ms\n` +
        `      level-05 work MEDIAN ${largeWork.toFixed(2)} ms (bound ${MAX_LEVEL_WORK_MS}) · ` +
        `ratio ${(largeWork / smallWork).toFixed(2)}x (bound ${MAX_LEVEL_WORK_RATIO}x)\n`,
    );

    expect(
      largeP95,
      `a ${SPIKE_MS} ms cost on one frame in ${SPIKE_EVERY} left the work p95 at ` +
        `${largeP95.toFixed(2)} ms, against a bound of ${MAX_LEVEL_WORK_P95_MS} ms. The p95 bound in ` +
        'phase-08-perf.spec.ts therefore cannot fail on a minority-frame stall — which is the only ' +
        'thing it exists to catch, the other three bounds being medians.',
    ).toBeGreaterThan(MAX_LEVEL_WORK_P95_MS);

    // 🔴 **And the red is ATTRIBUTABLE.** The medians stay under their own bounds, so a p95 failure
    // here names the p95 and not "cost went up somewhere" — the property `MAX_PER_PARTICLE_WORK_MS`
    // was recorded as unable to have. If this ever fails, the mutation has stopped isolating and the
    // proof above has stopped proving what it claims.
    expect(
      largeWork,
      `the spike moved the MEDIAN too (${largeWork.toFixed(2)} ms) — it is no longer a minority-frame ` +
        'mutation, and the p95 red above is not attributable to the p95',
    ).toBeLessThanOrEqual(MAX_LEVEL_WORK_MS);
    expect(
      largeWork / smallWork,
      'the spike moved the work RATIO too — see above, the red is no longer attributable',
    ).toBeLessThanOrEqual(MAX_LEVEL_WORK_RATIO);
  });
});
