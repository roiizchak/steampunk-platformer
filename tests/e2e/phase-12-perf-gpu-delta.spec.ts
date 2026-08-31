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
 * Same `PAIRS`, same AB/BA interleave, same `sampleArm` isolation protocol, same `pairedDeltas`. A
 * red proof measured more cheaply than the bound it is about is not a proof of that bound.
 *
 * ⚠️ **Strictly the POSITIVE direction.** The clean gate is two-sided — a large negative delta is an
 * arm-specific timer collapse, not a result — so a red proof satisfied by `Math.abs()` could be
 * satisfied by breaking the instrument. This asserts the median is above `+MAX_TOUCH_GPU_DELTA_MS`
 * and every pair is above zero.
 */

import { expect, test } from '@playwright/test';

import { TOUCH_IDS } from '../../src/render/touchLayout';
import { installGpuTimer } from './gpuTimer';
import { MIN_GPU_SAMPLES, MIN_SAMPLES } from './perfBudget';
import { assertRealGpu } from './realGpu';
import { bootToTouchPlay, drawnFaces, installTouchDriver } from './touchHarness';
import {
  FACE_COPIES,
  MAX_TOUCH_GPU_DELTA_MS,
  PAIRS,
  addFaceCopies,
  hideTexts,
  median,
  pairedDeltas,
  sampleArm,
  wakeLoop,
} from './touchPerf';

test.describe('Phase 12 — criterion 12.11, the GPU delta can go RED (vault C2)', () => {
  test('the controls drawn with real fill-rate cost break the paired GPU bound', async ({ browser }) => {
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

      const renderer = await assertRealGpu(withControls, '12.11-gpu-redproof');
      await assertRealGpu(without, '12.11-gpu-redproof control');
      await installGpuTimer(withControls);
      await installGpuTimer(without);

      // 🔴 Equalise everything that is not the controls. The keyboard help banner is ~130 glyphs
      // of 44 px bold text and the touch one is ~35, which is more fill rate than the controls and
      // runs the wrong way — the first clean run read every GPU pair NEGATIVE because of it.
      const textTouch = await hideTexts(withControls);
      const textBare = await hideTexts(without);
      expect(
        textTouch.hidden + textBare.hidden,
        'no text was visible in either arm, so this helper equalised nothing',
      ).toBeGreaterThan(0);
      for (const [t, name] of [
        [textTouch, 'touch'],
        [textBare, 'bare'],
      ] as const) {
        expect(
          t.stillVisible,
          `${t.stillVisible} text objects are still drawn in the ${name} arm — the arms differ by more than the controls`,
        ).toBe(0);
      }

      // 🔴 The precondition, before a single number. Zones are HITTABILITY — a `Zone` renders
      // nothing — so the pixels are the FACES, and they are asserted by name.
      const visible = new Set(
        (await drawnFaces(withControls, 'UI')).filter((f) => f.visible).map((f) => f.name),
      );
      for (const id of TOUCH_IDS) {
        expect(visible.has(id), `${id} has nothing drawn — the timed arm draws an empty frame there`).toBe(
          true,
        );
      }

      const added = await addFaceCopies(withControls, FACE_COPIES);
      // 🔴 EXACTLY the expected count. An amplifier that added nothing would report a flat delta as
      // the bound failing to fire, when nothing was ever drawn — Phase 8's `added` assertion, and
      // the reason it exists.
      expect(
        added,
        `the amplifier added ${added} faces, not ${TOUCH_IDS.length * FACE_COPIES}`,
      ).toBe(TOUCH_IDS.length * FACE_COPIES);

      const gpuWith: number[] = [];
      const gpuWithout: number[] = [];
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
          expect(
            s.gpuSupported,
            `EXT_disjoint_timer_query is absent in the ${name} arm — nothing here is measured`,
          ).toBe(true);
          expect(
            s.gpuSamples,
            `the ${name} arm's GPU median rests on ${s.gpuSamples} queries, under MIN_GPU_SAMPLES`,
          ).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);
        }

        gpuWith.push(touch.gpuMedianMs);
        gpuWithout.push(bare.gpuMedianMs);
      }

      const perPair = pairedDeltas(gpuWithout, gpuWith);
      const gpuDelta = median(perPair);

      // eslint-disable-next-line no-console
      console.log(
        `\n[12.11 gpu red proof] renderer ${renderer}\n` +
          `      bare gpu ${gpuWithout.map((v) => v.toFixed(4)).join(', ')}\n` +
          `      touch + ${FACE_COPIES} copies per control gpu ${gpuWith.map((v) => v.toFixed(4)).join(', ')}\n` +
          `      per pair ${perPair.map((v) => v.toFixed(4)).join(', ')} -> paired delta ` +
          `${gpuDelta.toFixed(4)} ms against a bound of ${MAX_TOUCH_GPU_DELTA_MS} ms\n`,
      );

      expect(
        gpuDelta,
        `the controls drawn with ${FACE_COPIES} extra copies of their OWN faces each measured only ` +
          `${gpuDelta.toFixed(4)} ms of extra rasteriser time per frame, against a bound of ` +
          `${MAX_TOUCH_GPU_DELTA_MS} ms. The GPU bound in phase-12-perf.spec.ts therefore cannot fail ` +
          'when the controls cost real fill rate, and it is decoration.',
      ).toBeGreaterThan(MAX_TOUCH_GPU_DELTA_MS);

      // 🔴 Every pair, not just the median of them. A statistic that orders only on aggregate is one
      // whose red depends on which pairs happened to land where.
      for (const [i, d] of perPair.entries()) {
        expect(d, `pair ${i} did not separate: ${d.toFixed(4)} ms`).toBeGreaterThan(0);
      }

      // The clean direction of this same comparison lives in `phase-12-perf.spec.ts`, which asserts
      // the delta is INSIDE the tolerance with the identical procedure. Both directions, one bound,
      // one session.
    } finally {
      await wakeLoop(withControls).catch(() => {});
      await wakeLoop(without).catch(() => {});
      await touchContext.close();
      await plainContext.close();
    }
  });
});
