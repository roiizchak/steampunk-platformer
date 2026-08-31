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
 * Same `PAIRS`, same AB/BA interleave, same `sampleArm` isolation protocol, same `pairedDeltas`,
 * same `hideTexts` equalisation. A red proof measured more cheaply than the bound it is about is not
 * a proof of that bound.
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

import { installGpuTimer } from './gpuTimer';
import { MIN_SAMPLES } from './perfBudget';
import { assertRealGpu } from './realGpu';
import { bootToTouchPlay, installTouchDriver } from './touchHarness';
import {
  MAX_TOUCH_CPU_DELTA_MS,
  PAIRS,
  REFRESH_COPIES,
  addRefreshCost,
  hideTexts,
  median,
  pairedDeltas,
  refreshCalls,
  sampleArm,
  wakeLoop,
} from './touchPerf';

test.describe('Phase 12 — criterion 12.11, the main-thread delta can go RED (vault C2)', () => {
  test("the controls' own refresh() run per frame breaks the paired CPU bound", async ({ browser }) => {
    test.setTimeout(300_000);

    const touchContext = await browser.newContext({ hasTouch: true });
    const plainContext = await browser.newContext({ hasTouch: false });
    const withControls = await touchContext.newPage();
    const without = await plainContext.newPage();
    try {
      await installTouchDriver(withControls);
      await installTouchDriver(without);
      await bootToTouchPlay(withControls);
      await bootToTouchPlay(without);

      const renderer = await assertRealGpu(withControls, '12.11-cpu-redproof');
      await assertRealGpu(without, '12.11-cpu-redproof control');
      await installGpuTimer(withControls);
      await installGpuTimer(without);

      // The same equalisation the clean gate applies, for the same reason.
      const textTouch = await hideTexts(withControls);
      const textBare = await hideTexts(without);
      expect(
        textTouch.hidden + textBare.hidden,
        'no text was visible in either arm, so this helper equalised nothing',
      ).toBeGreaterThan(0);

      // 🔴 The amplifier hooked something. Without this an amplifier that attached to nothing reads
      // as a bound failing to fire when no extra work was ever done — `addFaceCopies`'s `added`
      // assertion, and the reason Phase 8 has one.
      expect(
        await addRefreshCost(withControls, REFRESH_COPIES),
        'the UI scene or its TouchSession was absent, so no extra refresh() work was added at all',
      ).toBe(true);

      const cpuWith: number[] = [];
      const cpuWithout: number[] = [];
      let callsBefore = await refreshCalls(withControls);
      for (let pair = 0; pair < PAIRS; pair += 1) {
        const first = pair % 2 === 0;
        const a = first
          ? await sampleArm(withControls, without, `pair ${pair} touch`)
          : await sampleArm(without, withControls, `pair ${pair} bare`);
        const b = first
          ? await sampleArm(without, withControls, `pair ${pair} bare`)
          : await sampleArm(withControls, without, `pair ${pair} touch`);
        const touch = first ? a : b;
        const bare = first ? b : a;

        for (const [s, name] of [
          [touch, 'touch'],
          [bare, 'bare'],
        ] as const) {
          expect(s.frames, `too few frames served in the ${name} arm`).toBeGreaterThanOrEqual(MIN_SAMPLES);
        }

        // 🔴 The extra work happened DURING this window, not merely once at hook time. A hook whose
        // wrapper stopped being called — a scene restart, a swapped update — would leave every
        // number below measuring the clean game while this spec reported the bound uncrossable.
        const callsNow = await refreshCalls(withControls);
        expect(
          callsNow,
          `pair ${pair}: the refresh hook made no calls during the window, so nothing was amplified`,
        ).toBeGreaterThan(callsBefore);
        callsBefore = callsNow;

        cpuWith.push(touch.workMedianMs);
        cpuWithout.push(bare.workMedianMs);
      }

      const perPair = pairedDeltas(cpuWithout, cpuWith);
      const cpuDelta = median(perPair);

      // eslint-disable-next-line no-console
      console.log(
        `\n[12.11 cpu red proof] renderer ${renderer}\n` +
          `      bare work ${cpuWithout.map((v) => v.toFixed(4)).join(', ')}\n` +
          `      touch + ${REFRESH_COPIES} refresh()/frame work ${cpuWith.map((v) => v.toFixed(4)).join(', ')}\n` +
          `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
          `${cpuDelta.toFixed(4)} ms against a bound of ${MAX_TOUCH_CPU_DELTA_MS} ms\n`,
      );

      expect(
        cpuDelta,
        `the controls' own refresh() run ${REFRESH_COPIES} extra times per frame measured only ` +
          `${cpuDelta.toFixed(4)} ms of extra main-thread time, against a bound of ` +
          `${MAX_TOUCH_CPU_DELTA_MS} ms. The CPU bound in phase-12-perf.spec.ts therefore cannot fail ` +
          'when the controls cost real main-thread work, and it is decoration.',
      ).toBeGreaterThan(MAX_TOUCH_CPU_DELTA_MS);

      // Every pair, not just the median of them.
      for (const [i, d] of perPair.entries()) {
        expect(d, `pair ${i} did not separate: ${d.toFixed(4)} ms`).toBeGreaterThan(0);
      }
    } finally {
      await wakeLoop(withControls).catch(() => {});
      await wakeLoop(without).catch(() => {});
      await touchContext.close();
      await plainContext.close();
    }
  });
});
