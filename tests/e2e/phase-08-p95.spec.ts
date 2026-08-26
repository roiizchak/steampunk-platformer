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
/**
 * 🔴 **10 sat exactly on the p95 boundary and flipped run to run.** One frame in ten is 10 %
 * of frames — but the hook wraps `window.requestAnimationFrame`, so its counter advances once per
 * registered CALLBACK, and the page has more than one rAF consumer. The effective duty cycle on the
 * frames the sampler measures is therefore **1 in 20 — 5 %, the p95 threshold itself**, and whether
 * the 95th percentile lands on a spiked frame becomes a coin flip. The readings are bimodal and say
 * so: isolated, per-pair p95 came back `24.70, 4.30, 24.60, 24.60`; inside the full sweep the same
 * spec read `4.70, 4.80, 4.60, 24.80` and the median fell to 4.75 against a bound of 16.
 *
 * ⚠️ **And 1 in 5 was too far the other way** — it reddened the p95 on every pair
 * (24.50-24.70) and then failed the ATTRIBUTION assertion below: work median 4.05 ms and a ratio of
 * **8.10x** against a bound of 2. A minority-frame cost does not move a 50th percentile by
 * arithmetic, but the measured `work` is `now - frameStart`, so a 24 ms burn also delays the frames
 * around it. The test caught its own mutation ceasing to isolate, which is exactly what those three
 * assertions are for.
 *
 * **1 in 7 is the setting that satisfies both ends**, measured rather than reasoned: p95
 * 24.70 / 24.50 / 24.50 / 24.50, work median **0.65 ms** and ratio **1.44x**, both comfortably under
 * their bounds. The window between the p95 threshold and median contamination is narrow, and the
 * duty-cycle premise below now ASSERTS where in it this run landed rather than trusting the
 * nominal figure — the effective fraction depends on how many rAF consumers the page has and on
 * how loaded the box is, neither of which this constant controls.
 */
const SPIKE_EVERY = 7;

test.describe('Phase 8 — criterion 8.7, the work p95 can go RED (vault C2)', () => {
  test('a minority-frame spike breaks the p95 bound and NOTHING else', async ({ page }) => {
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

    // 🔴 **And it burned often enough to reach a 95th percentile.** `fired > 50` is satisfied by a
    // duty cycle of 1 %, which cannot move a p95 at all — so a green below would have said "the p95
    // bound cannot fire" when the truth was "the mutation never asked it to". This is the premise
    // that the earlier `SPIKE_EVERY = 10` silently violated: measured 5 %, exactly the threshold.
    const largeFrames = large.reduce((n, s) => n + s.frames, 0);
    expect(
      fired / largeFrames,
      `${fired} spikes across ${largeFrames} measured frames is a duty cycle a p95 cannot see`,
    ).toBeGreaterThan(0.06);

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
