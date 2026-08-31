/**
 * **The red proof for criterion 12.11's MAIN-THREAD bound** — `MAX_TOUCH_CPU_DELTA_MS`, watched
 * failing. M73.
 *
 * ## 🔴 Why this file exists at all
 *
 * It did not, and that was the defect. `phase-12-perf-gpu-delta.spec.ts` amplifies fill rate and
 * asserts only `gpuDelta`; nothing anywhere drove the main-thread delta across its bound, so the
 * statistic `touchPerf.ts` calls the criterion-bearing main-thread claim rested on prose. *A gate
 * that cannot go red is decoration* — and this repository has already shipped that exact shape twice
 * this phase, at 40 face copies and at a per-pair CPU band its own noise saturated.
 * `performance-engineer` brief 1, finding 1.
 *
 * ## The amplifier is the regression, not a stand-in for it
 *
 * `touchPerf.ts` names what `MAX_TOUCH_CPU_DELTA_MS` exists to catch: *"`refresh()` running per
 * frame instead of per state change"*. `UIScene.touch` is a public `TouchSession` and its
 * `refresh()` re-places and re-gates the six controls (`touchSession.ts:94-95`), so calling it
 * `REFRESH_COPIES` extra times per frame **is** that regression, that many times over. A busy loop
 * would prove the timer can see wall-clock work — the stand-in mistake Phase 8 paid for with 240
 * full-viewport scrims.
 *
 * It lands in ONE arm: the two arms are separate browser contexts, so nothing can leak across the
 * way `addScrims` on a parallel `UI` scene leaked into both arms in Phase 8.
 *
 * ## It re-runs the SAME procedure as the bound
 *
 * Same `makeArms` two-block creation-order counterbalance, same `PAIRS`, same AB/BA interleave,
 * same `sampleArm` isolation protocol, same `pairedDeltas`, same `hideTexts` equalisation, and
 * the verdict comes from the clean gate's own `withinBudget` under this statistic's own policy.
 * A red proof measured more cheaply than the bound it is about is not a proof of that bound.
 *
 * ⚠️ **Strictly the POSITIVE direction.** The clean gate is two-sided — a large negative delta is an
 * arm-specific collapse, not a result — so a red proof satisfied by `Math.abs()` could be satisfied
 * by breaking the instrument.
 *
 * ⚠️ **The filename is load-bearing.** `specRouting.ts` partitions Phase 12 by PREFIX
 * (`/phase-12-perf[a-z0-9-]*\.spec\.ts/`), so a name outside it runs in headless `chromium-touch`
 * while an "exactly one project" assertion passes. Pinned BY NAME in `spec-routing.test.ts`.
 */

import { expect, test } from '@playwright/test';

import { MIN_SAMPLES } from './perfBudget';
import { REFRESH_COPIES, addRefreshCost, refreshCalls } from './touchAmplifiers';
import { makeArms } from './touchArms';
import {
  MAX_TOUCH_CPU_DELTA_MS,
  PAIRS,
  median,
  pairedDeltas,
  sampleArm,
  wakeLoop,
  withinBudget,
} from './touchPerf';

test.describe('Phase 12 — criterion 12.11, the main-thread delta can go RED (vault C2)', () => {
  test("the controls own refresh() run per frame breaks the paired CPU bound", async ({ browser }) => {
    test.setTimeout(600_000);

    const withAmp: number[] = [];
    const without: number[] = [];
    let renderer = 'unknown';

    // 🔴 The SAME two counterbalanced blocks the clean gate runs, through the SAME `makeArms`.
    // This spec used to create the touch context first and keep it first for the whole run — the
    // exact confound `touchArms.ts` exists to remove. A red proof that does not run the criterion's
    // own measurement procedure is a proof of a different measurement. Codex round 15, finding 2.
    // `makeArms` also carries the `hideTexts` equalisation and its `stillVisible === 0` assertions,
    // which this spec had been missing entirely.
    for (const touchFirst of [true, false]) {
      const label = `12.11 cpu red proof ${touchFirst ? 'touch-first' : 'bare-first'}`;
      const arms = await makeArms(browser, touchFirst, label);
      renderer = arms.renderer;
      const touch = arms.touch;
      const bare = arms.bare;
      try {

        // 🔴 The amplifier hooked something. `addRefreshCost` returning true is not enough on its
        // own — reassigning `scene.update` returned true and did nothing, because Phaser caches the
        // scene's update function into `sys.sceneUpdate` at boot. The call COUNTER below is what
        // caught that.
        expect(
          await addRefreshCost(touch, REFRESH_COPIES),
          `${label}: the UI scene or its TouchSession was absent, so no extra work was added`,
        ).toBe(true);
        let callsBefore = await refreshCalls(touch);

        for (let pair = 0; pair < PAIRS / 2; pair += 1) {
          const first = pair % 2 === 0;
          const a = first
            ? await sampleArm(touch, bare, `${label} pair ${pair} touch`)
            : await sampleArm(bare, touch, `${label} pair ${pair} bare`);
          const b = first
            ? await sampleArm(bare, touch, `${label} pair ${pair} bare`)
            : await sampleArm(touch, bare, `${label} pair ${pair} touch`);
          const hot = first ? a : b;
          const cold = first ? b : a;

          for (const [smp, name] of [
            [hot, 'touch'],
            [cold, 'bare'],
          ] as const) {
            expect(
              smp.frames,
              `${label}: too few frames served in the ${name} arm`,
            ).toBeGreaterThanOrEqual(MIN_SAMPLES);
          }

          // 🔴 The extra work happened DURING this window, not merely once at hook time.
          const callsNow = await refreshCalls(touch);
          expect(
            callsNow,
            `${label} pair ${pair}: the refresh hook made no calls during the window`,
          ).toBeGreaterThan(callsBefore);
          callsBefore = callsNow;


          withAmp.push(hot.workMedianMs);
          without.push(cold.workMedianMs);
        }
      } finally {
        await wakeLoop(touch).catch(() => {});
        await wakeLoop(bare).catch(() => {});
        await arms.close();
      }
    }

    expect(withAmp.length, 'the two blocks did not produce PAIRS pairs between them').toBe(PAIRS);

    const perPair = pairedDeltas(without, withAmp);
    const delta = median(perPair);

    // eslint-disable-next-line no-console
    console.log(
      `\n[12.11 cpu red proof] renderer ${renderer}\n` +
        `      bare ${without.map((v) => v.toFixed(4)).join(', ')}\n` +
        `      amplified ${withAmp.map((v) => v.toFixed(4)).join(', ')}\n` +
        `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
        `${delta.toFixed(4)} ms against a bound of ${MAX_TOUCH_CPU_DELTA_MS} ms\n`,
    );

    // 🔴 REJECTED BY THE CLEAN GATE'S OWN EVALUATOR, under its own policy for this statistic — not
    // by a restatement of its bound. `withinBudget` is the single function `phase-12-perf.spec.ts`
    // asserts `ok` from; this asserts `!ok`. Written out separately, this spec proved only that it
    // could measure a difference, and deleting the clean gate's expectations left it green.
    const verdict = withinBudget(perPair, MAX_TOUCH_CPU_DELTA_MS, 'main-thread', 'median-only');
    expect(
      verdict.ok,
      `the controls' own refresh() run ${REFRESH_COPIES} extra times per frame did not move the paired ${verdict.why}. The clean gate therefore cannot fail ` +
        'when this regression is present, and it is decoration.',
    ).toBe(false);

    // 🔴 And strictly the POSITIVE direction on top: `withinBudget` is two-sided, so a red proof
    // satisfied by it alone could be satisfied by breaking the instrument.
    expect(
      delta,
      `the amplified delta is ${delta.toFixed(4)} ms — a red proof must exceed +${MAX_TOUCH_CPU_DELTA_MS}, not merely differ`,
    ).toBeGreaterThan(MAX_TOUCH_CPU_DELTA_MS);

    // 🔴 **And NOT a per-pair rule on top.** This used to require every pair above zero, which is
    // an extra condition neither the criterion nor `withinBudget`'s policy for this statistic
    // imposes: an amplified run whose median clears the bound but whose noisiest pair lands one
    // quantum negative is a legal red the proof would have called a failure. A red proof that is
    // stricter than the gate it proves is a gate of its own, unowned. Codex round 16, finding 3.
  });
});
