/**
 * **The red proof for criterion 12.11's GPU bound** — `MAX_TOUCH_GPU_DELTA_MS`, watched failing.
 *
 * ## 🔴 The filename is load-bearing, and this is the second time
 *
 * `specRouting.ts` partitions Phase 12 by PREFIX: `TOUCH_PERF_SPECS` is
 * `/phase-12-perf[a-z0-9-]*\.spec\.ts/`. A file called `phase-12-gpu-delta.spec.ts` would match
 * `TOUCH_ALL_SPECS` and NOT the perf pattern, so it would run in headless `chromium-touch` — a GPU
 * timing spec measuring SwiftShader — while an "exactly one project" assertion passed happily.
 * Named by the Codex plan review before the file existed. `spec-routing.test.ts` now asserts this
 * name lands in `chromium-touch-gpu` **by name**, not merely in one project.
 *
 * ## What is amplified, and why not scrims
 *
 * Extra copies of **the controls' own faces**, drawn on the touch arm's `UI` scene. Phase 8 paid for
 * this lesson: its first red proof used 240 full-viewport alpha rectangles, and the Codex
 * implementation review was right that this proves the timer can see extreme fill-rate work, not
 * that a regression in *the thing the bound is about* can cross it. A bound red-proved by a stand-in
 * is red-proved for a different claim than the one it asserts.
 *
 * Two properties make these the right amplifier:
 *
 * - **They are the controls' own textures at the controls' own alpha.** Every extra fragment is a
 *   fragment of a touch control.
 * - **They land in ONE arm.** The two arms are separate browser contexts here, not a scene restart,
 *   so nothing can leak the way `addScrims` on a parallel `UI` scene leaked into both arms in Phase
 *   8 — the identical mistake criterion 7.7's first audio toggle made.
 *
 * ## It re-runs the SAME procedure as the bound
 *
 * Same `makeArms` two-block creation-order counterbalance, same `PAIRS`, same AB/BA interleave,
 * same `sampleArm` isolation protocol, same `pairedDeltas`, and the verdict comes from the clean
 * gate's own `withinBudget`. A red proof measured more cheaply than the bound it is about is not
 * a proof of that bound.
 *
 * ⚠️ **Strictly the POSITIVE direction.** The clean gate is two-sided — a large negative delta is an
 * arm-specific timer collapse, not a result — so a red proof satisfied by `Math.abs()` could be
 * satisfied by breaking the instrument. This asserts the median is above `+MAX_TOUCH_GPU_DELTA_MS`
 * and every pair is above zero.
 */

import { expect, test } from '@playwright/test';

import { MIN_GPU_SAMPLES, MIN_SAMPLES } from './perfBudget';
import { TOUCH_IDS } from '../../src/render/touchLayout';
import { FACE_COPIES, addFaceCopies } from './touchAmplifiers';
import { makeArms } from './touchArms';
import {
  MAX_TOUCH_GPU_DELTA_MS,
  PAIRS,
  median,
  pairedDeltas,
  sampleArm,
  wakeLoop,
  withinBudget,
} from './touchPerf';

test.describe('Phase 12 — criterion 12.11, the GPU delta can go RED (vault C2)', () => {
  test('the controls drawn with real fill-rate cost break the paired GPU bound', async ({ browser }) => {
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
      const label = `12.11 gpu red proof ${touchFirst ? 'touch-first' : 'bare-first'}`;
      const arms = await makeArms(browser, touchFirst, label);
      renderer = arms.renderer;
      const touch = arms.touch;
      const bare = arms.bare;
      try {
        const added = await addFaceCopies(touch, FACE_COPIES);
        // 🔴 EXACTLY the expected count. An amplifier that added nothing would report a flat delta
        // as the bound failing to fire, when nothing was ever drawn.
        expect(
          added,
          `${label}: the amplifier added ${added} faces, not ${TOUCH_IDS.length * FACE_COPIES}`,
        ).toBe(TOUCH_IDS.length * FACE_COPIES);

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
            expect(
              smp.gpuSupported,
              `${label}: EXT_disjoint_timer_query is absent in the ${name} arm — nothing here is measured`,
            ).toBe(true);
            expect(
              smp.gpuSamples,
              `${label}: the ${name} arm's GPU median rests on ${smp.gpuSamples} queries, under MIN_GPU_SAMPLES`,
            ).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);
          }


          withAmp.push(hot.gpuMedianMs);
          without.push(cold.gpuMedianMs);
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
      `\n[12.11 gpu red proof] renderer ${renderer}\n` +
        `      bare ${without.map((v) => v.toFixed(4)).join(', ')}\n` +
        `      amplified ${withAmp.map((v) => v.toFixed(4)).join(', ')}\n` +
        `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
        `${delta.toFixed(4)} ms against a bound of ${MAX_TOUCH_GPU_DELTA_MS} ms\n`,
    );

    // 🔴 REJECTED BY THE CLEAN GATE'S OWN EVALUATOR, under its own policy for this statistic — not
    // by a restatement of its bound. `withinBudget` is the single function `phase-12-perf.spec.ts`
    // asserts `ok` from; this asserts `!ok`. Written out separately, this spec proved only that it
    // could measure a difference, and deleting the clean gate's expectations left it green.
    const verdict = withinBudget(perPair, MAX_TOUCH_GPU_DELTA_MS, 'rasteriser', 'median-and-pairs');
    expect(
      verdict.ok,
      `the controls drawn with ${FACE_COPIES} extra copies of their OWN faces each did not move the paired ${verdict.why}. The clean gate therefore cannot fail ` +
        'when this regression is present, and it is decoration.',
    ).toBe(false);

    // 🔴 And strictly the POSITIVE direction on top: `withinBudget` is two-sided, so a red proof
    // satisfied by it alone could be satisfied by breaking the instrument.
    expect(
      delta,
      `the amplified delta is ${delta.toFixed(4)} ms — a red proof must exceed +${MAX_TOUCH_GPU_DELTA_MS}, not merely differ`,
    ).toBeGreaterThan(MAX_TOUCH_GPU_DELTA_MS);

    // 🔴 **And NOT a per-pair rule on top.** This used to require every pair above zero, which is
    // an extra condition neither the criterion nor `withinBudget`'s policy for this statistic
    // imposes: an amplified run whose median clears the bound but whose noisiest pair lands one
    // quantum negative is a legal red the proof would have called a failure. A red proof that is
    // stricter than the gate it proves is a gate of its own, unowned. Codex round 16, finding 3.
  });
});
