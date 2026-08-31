import { expect, test } from '@playwright/test';

import { TOUCH_IDS } from '../../src/render/touchLayout';
import { MIN_GPU_SAMPLES, MIN_SAMPLES } from './perfBudget';
import { drawnFaces, drawnZones } from './touchHarness';
import { makeArms } from './touchArms';
import {
  MAX_TOUCH_ARM_CPU_MS,
  MAX_TOUCH_ARM_GPU_MS,
  MAX_TOUCH_CPU_DELTA_MS,
  MAX_TOUCH_CPU_PAIR_MS,
  MAX_TOUCH_GPU_DELTA_MS,
  PAIRS,
  median,
  pairedDeltas,
  sampleArm,
  wakeLoop,
} from './touchPerf';

/**
 * **Criterion 12.11 — the frame budget with the controls drawn.**
 *
 * ⚠️ **The headless harness is not the frame rate.** HANDOFF §14 measured the same scene at 90.10 ms
 * headless against 4.2 ms on the real GPU — a factor of 21 — so this spec runs in
 * `chromium-touch-gpu` (headed, GPU flags, `hasTouch`) and calls `assertRealGpu` before taking a
 * single number. A refused GPU request falls back to SwiftShader **silently**.
 *
 * ⚠️ **Only same-session interleaved A/Bs decide a performance question.** An absolute millisecond
 * figure from this harness means little: Vite is still compiling, the box is shared. So the two arms
 * are sampled A, B, A, B, A, B in one run of one spec, and the comparison is between their medians.
 *
 * ## The statistic is FRAMES SERVED, not a percentile
 *
 * A percentile is blind to exactly the failure this phase could cause. The controls are six DRAWN
 * faces and one non-drawing zone each — measured, see below; if they cost anything it is a small,
 * constant, per-frame cost —
 * and at ~240 fps against a 60 Hz sim, a p95 taken over the same window moved by 0.3 ms while a
 * 30 ms stall went unseen (the Phase 9 lesson). Frames served over a fixed wall-clock window counts
 * every frame, so a per-frame cost shows up as fewer of them.
 *
 * ## 🔴 What the FRAMES-SERVED bound cannot see, and what replaced it
 *
 * Both 12.11 briefs reached this independently and they were right: **frames served against a
 * vsync-locked display cannot order its own mutation.** At 240 Hz the frame period is 4.1667 ms; a
 * frame either makes its deadline or costs a whole period, so the ratio is 1.000 below the headroom
 * and 0.500 above it and nothing lands between. The invisible band is roughly [0, 2.7 ms] of added
 * per-frame cost — 65 % of this box's frame budget, and a drop to ~30 fps on the owner's 60 Hz
 * laptop. *A statistic that does not order its own mutation cannot be fixed by moving the bound.*
 *
 * So the criterion-bearing statistics are now **absolute paired per-frame deltas in milliseconds** —
 * GPU and main thread — against tolerances fixed in `touchPerf.ts` before any run. The frames-served
 * ratio and the baseline floor are KEPT below rather than swapped out: they catch a dropped frame
 * and a collapsed baseline, which a delta cannot, and this spec's own docstring already said they
 * were worth running. The red proof for the GPU bound is `phase-12-perf-gpu-delta.spec.ts`.
 *
 * ⚠️ **And the two arms no longer share a GPU while one is measured.** Both contexts used to stay
 * alive and rendering, so system load was `2·base + C` in both samples and a GPU-bound cost divided
 * out exactly. `sampleArm` stops the idle page's game loop and ASSERTS its tick frozen across the
 * window — commanding the isolation and observing it are different things, and a wrong-page call
 * would have silently restored the cancellation with every assertion still green.
 *
 * ⚠️ **The controls ship only to touch devices**, so this gate still runs on a desktop GPU and there
 * is no mobile timing evidence anywhere in this repository. Recorded, not papered over.
 *
 * ## 🔴 What the paired delta can and cannot resolve, measured rather than assumed
 *
 * After `hideTexts` the two arms' display lists were dumped and diffed, and they differ by **exactly
 * the six control faces** — 160 x 160 at alpha 0.85 — plus three objects that are already invisible
 * (the rotate prompt's scrim and its two lines). Nothing else.
 *
 * Six such faces are about 0.5 % of a 1920 x 1080 frame, and the M72 amplifier measures 4800 of them
 * at 0.706 ms, so **the whole feature costs on the order of 0.001 ms** of rasteriser time. The
 * per-pair spread between two browser contexts is +/-0.2 ms. The feature is therefore two to three
 * orders of magnitude below this instrument's noise floor.
 *
 * 🔴 **And the residual -0.07 to -0.18 ms offset was a CONFOUND, not noise.** The touch arm read
 * *cheaper* than the bare one across all sixteen pairs recorded before this was fixed, while drawing
 * six more images. Equalising more did not shrink it — hiding the help banner moved it from -0.119
 * to -0.068 and the display-list diff showed nothing left to hide — because the cause was not on
 * either display list: `hasTouch` is fixed at context creation, the touch role was pinned to the
 * first-created context for the whole run, and AB/BA swapped only sampling order. Up to 36 % of the
 * tolerance, systematically in the direction that hides a regression. `touchArms.ts` counterbalances
 * creation order across two blocks. `performance-engineer` brief 2, finding 1.
 *
 * So this gate does **not** claim the controls cost under 0.5 ms of extra frame time — that is true
 * by three orders of magnitude and needs no gate. It claims that no ABSOLUTE regression of half a
 * millisecond per frame — a filter, a per-frame re-render, a full-screen overdraw, a `refresh()`
 * moved into `update()` — has appeared on the touch arm. That is the class of defect 12.11 is about,
 * and `MAX_TOUCH_ARM_GPU_MS` catches the one a delta structurally cannot.
 *
 * ## The precondition that makes the arms mean anything
 *
 * 🔴 The touch arm asserts **every control is drawn and interactive** before timing starts.
 * Without it, a build where the controls silently failed to appear would report the budget
 * unregressed for the most persuasive possible wrong reason.
 *
 * ⚠️ **This spec does NOT gate `chromium-touch-gpu`'s `hasTouch`, and an earlier version of this
 * comment claimed it did.** M13 dropped `hasTouch: true` from the project's `use` block and this
 * spec stayed **green** — because the two arms below are built here, from
 * `browser.newContext({ hasTouch })`, so the project's value never reaches either of them. What
 * gates it is `tests/unit/playwright-projects.test.ts`, which reads the `use` blocks directly. The
 * precondition above is still load-bearing; it just answers a different question than the config.
 */

test('12.11 the frame budget is unregressed with the controls drawn', async ({ browser }) => {
  test.setTimeout(300_000);

  const controlsArm: number[] = [];
  const bareArm: number[] = [];
  const gpuWith: number[] = [];
  const gpuWithout: number[] = [];
  const cpuWith: number[] = [];
  const cpuWithout: number[] = [];
  let renderer = 'unknown';

  // 🔴 TWO BLOCKS, and the block variable is which browser context is CREATED first.
  // `performance-engineer` brief 2, finding 1: `hasTouch` is fixed at context creation, so AB/BA
  // within a run swaps sampling order and never the touch ROLE. Any cost tied to context identity —
  // JIT warmth, GPU context and swap-chain allocation order — therefore rode along on every pair in
  // the same direction, which is exactly the -0.07 to -0.18 ms offset this file used to record as an
  // artefact. Half the pairs each way puts creation order on both sides of the comparison.
  for (const touchFirst of [true, false]) {
    const label = `12.11 ${touchFirst ? 'touch-first' : 'bare-first'}`;
    const arms = await makeArms(browser, touchFirst, label);
    renderer = arms.renderer;
    const withControls = arms.touch;
    const without = arms.bare;
    try {
      // 🔴 The precondition, in BOTH blocks. Time nothing until the thing being measured is on
      // screen — and a block whose arms booted differently is not the same measurement.
      const drawn = await drawnZones(withControls, 'UI');
      expect(
        drawn.length,
        `${label}: the touch arm has no controls, so it is not the arm it claims to be`,
      ).toBe(TOUCH_IDS.length);
      // 🔴 Zones are HITTABILITY. A `Zone` renders nothing — `touchMeasure.ts` says so in as many
      // words — so the assertion above cannot tell a drawn arm from an undrawn one. Delete the
      // `setVisible(wanted)` loop in `refresh()` and every zone is still there and still
      // interactive, while the timed arm draws zero extra pixels: the criterion's own named failure
      // mode, passing its own precondition. The pixels are the FACES. Found by both 12.11 briefs.
      //
      // ⚠️ **This was `> drawn.length` and the adopted art broke it, correctly.** The grey box drew
      // a plate plus several marks per control, so "more faces than zones" happened to hold; one
      // generated image per control makes the two counts EQUAL, and the bound false-redded a build
      // that draws strictly better pixels. The claim was never about a ratio — it is *every control
      // has something visible* — so it is asserted per control, by name, which the count could not
      // do either: six visible faces all belonging to one plate passed the old form.
      const visibleFaces = (await drawnFaces(withControls, 'UI')).filter((f) => f.visible);
      const facesFor = new Set(visibleFaces.map((f) => f.name));
      for (const id of TOUCH_IDS) {
        expect(
          facesFor.has(id),
          `${label}: ${id} has a hit area and nothing drawn — the timed arm would draw an empty frame there`,
        ).toBe(true);
      }
      for (const z of drawn) {
        expect(z.interactive, `${label}: ${z.name} is not live in the timed arm`).toBe(true);
      }
      expect(
        await drawnZones(without, 'UI'),
        `${label}: the control arm has touch controls, so the two arms are the same arm`,
      ).toEqual([]);

      // 🔴 AB/BA inside the block, and `PAIRS` is EVEN so each block gets a whole AB+BA. Always
      // sampling the touch arm first leaves an order effect perfectly correlated with the arm.
      for (let pair = 0; pair < PAIRS / 2; pair += 1) {
        const first = pair % 2 === 0;
        const a = first
          ? await sampleArm(withControls, without, `${label} pair ${pair} touch`)
          : await sampleArm(without, withControls, `${label} pair ${pair} bare`);
        const b = first
          ? await sampleArm(without, withControls, `${label} pair ${pair} bare`)
          : await sampleArm(withControls, without, `${label} pair ${pair} touch`);
        const touch = first ? a : b;
        const bare = first ? b : a;

        for (const [smp, name] of [
          [touch, 'touch'],
          [bare, 'bare'],
        ] as const) {
          expect(typeof smp.frames).toBe('number');
          expect(smp.frames, `${label}: the ${name} arm served no frames at all`).toBeGreaterThanOrEqual(
            MIN_SAMPLES,
          );
          // A page that stopped ticking is not a page whose frame budget can be compared.
          expect(smp.ticks, `${label}: the simulation stopped in the ${name} arm`).toBeGreaterThan(0);
          expect(
            smp.gpuSupported,
            `${label}: EXT_disjoint_timer_query is absent in the ${name} arm — nothing below is measured`,
          ).toBe(true);
          // 🔴 `MIN_GPU_SAMPLES`, not `> 0`. The shared contract says 30 is the fewest queries a GPU
          // median may rest on; `> 0` would let ONE delayed query per arm decide the bound.
          expect(
            smp.gpuSamples,
            `${label}: the ${name} arm's GPU median rests on ${smp.gpuSamples} queries, under MIN_GPU_SAMPLES`,
          ).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);
        }

        controlsArm.push((touch.frames / touch.elapsedMs) * 1000);
        bareArm.push((bare.frames / bare.elapsedMs) * 1000);
        gpuWith.push(touch.gpuMedianMs);
        gpuWithout.push(bare.gpuMedianMs);
        cpuWith.push(touch.workMedianMs);
        cpuWithout.push(bare.workMedianMs);
      }
    } finally {
      // 🔴 Both, unconditionally. A failed assertion mid-pair leaves one page's loop stopped, and a
      // stopped page is a page whose teardown can hang.
      await wakeLoop(withControls).catch(() => {});
      await wakeLoop(without).catch(() => {});
      await arms.close();
    }
  }

  // 🔴 Pooled across both creation orders, so `PAIRS` pairs still decide the bound.
  expect(gpuWith.length, 'the two blocks did not produce PAIRS pairs between them').toBe(PAIRS);

    const withFps = median(controlsArm);
    const withoutFps = median(bareArm);
    const gpuPer = pairedDeltas(gpuWithout, gpuWith);
    const cpuPer = pairedDeltas(cpuWithout, cpuWith);
    const gpuDelta = median(gpuPer);
    const cpuDelta = median(cpuPer);
    const armGpu = median(gpuWith);
    const armCpu = median(cpuWith);

    // eslint-disable-next-line no-console
    console.log(
      `\n[12.11] renderer ${renderer}\n` +
        `      frames/s median — with controls ${withFps.toFixed(1)}, without ${withoutFps.toFixed(1)}\n` +
        `      gpu per pair ${gpuPer.map((v) => v.toFixed(4)).join(', ')} -> ${gpuDelta.toFixed(4)} ms ` +
        `against ${MAX_TOUCH_GPU_DELTA_MS} ms\n` +
        `      cpu per pair ${cpuPer.map((v) => v.toFixed(4)).join(', ')} -> ${cpuDelta.toFixed(4)} ms ` +
        `against ${MAX_TOUCH_CPU_DELTA_MS} ms\n` +
        `      touch-arm gpu median ${armGpu.toFixed(4)} ms against a ${MAX_TOUCH_ARM_GPU_MS} ms ceiling\n`,
    );

    // 🔴 An ABSOLUTE ceiling on the touch arm's own median, not a difference. Halve the frame rate
    // in BOTH arms and every delta below stays 0.000 while the game is broken — Phase 7's G32
    // finding, where `audioCues` in both arms moved each median 2 ms and the delta read 0.000.
    expect(
      armGpu,
      `the touch arm's own GPU median is ${armGpu.toFixed(4)} ms of a ${MAX_TOUCH_ARM_GPU_MS} ms ` +
        'ceiling — the baseline has collapsed, so the deltas below compare two broken runs',
    ).toBeLessThan(MAX_TOUCH_ARM_GPU_MS);
    // 🔴 The same guard on the MAIN THREAD, which a paired difference cannot give either. Phase 7's
    // G32: a cost left in BOTH arms moved each median 2 ms and the delta read 0.000.
    expect(
      armCpu,
      `the touch arm's own main-thread median is ${armCpu.toFixed(4)} ms of a ${MAX_TOUCH_ARM_CPU_MS} ms ` +
        'ceiling — the baseline has collapsed, so the deltas here compare two broken runs',
    ).toBeLessThan(MAX_TOUCH_ARM_CPU_MS);
    expect(
      withoutFps,
      `the control arm itself served only ${withoutFps.toFixed(1)} frames/s`,
    ).toBeGreaterThan(50);
    expect(
      withFps,
      `the controls cost ${(100 - (withFps / withoutFps) * 100).toFixed(1)}% of the frame rate`,
    ).toBeGreaterThan(withoutFps * 0.9);

    // 🔴 BOUNDED ON BOTH SIDES, per pair and on the median. A one-sided upper bound reads an
    // arm-specific timer collapse as excellent performance, and this repository already has that
    // episode on record: a clean paired delta of -0.243 ms when one arm's median stopped being a
    // measurement (`phase-08-perf.spec.ts`). The lower side is an instrument-validity check, not a
    // performance claim.
    // 🔴 The main-thread pair bound is `MAX_TOUCH_CPU_PAIR_MS`, not `MAX_TOUCH_CPU_DELTA_MS`, and
    // the held-out sweep is why: `workMedianMs` is a median over Chrome's 0.1 ms `performance.now()`
    // grid of a quantity that is itself only 0.8-0.9 ms, so +/-0.5 ms per pair is +/-5 quanta of
    // nine. One pair read exactly -0.5000 ms while the median of the same four read -0.1000. The
    // criterion-bearing main-thread claim is the median assertion below; this one is a collapse
    // guard. See `touchPerf.ts` for the sixteen recorded pairs.
    for (const [deltas, bound, unit] of [
      [gpuPer, MAX_TOUCH_GPU_DELTA_MS, 'rasteriser'],
      [cpuPer, MAX_TOUCH_CPU_PAIR_MS, 'main-thread'],
    ] as const) {
      for (const [i, d] of deltas.entries()) {
        expect(
          Math.abs(d),
          `pair ${i}: the controls moved ${unit} time by ${d.toFixed(4)} ms, outside +/-${bound} ms` +
            (d < 0 ? ' — a delta this negative is an arm-specific collapse, not a result' : ''),
        ).toBeLessThan(bound);
      }
    }
    expect(
      Math.abs(gpuDelta),
      `the controls cost ${gpuDelta.toFixed(4)} ms of rasteriser time per frame, against ` +
        `+/-${MAX_TOUCH_GPU_DELTA_MS} ms (3 % of the 60 Hz budget)`,
    ).toBeLessThan(MAX_TOUCH_GPU_DELTA_MS);
    expect(
      Math.abs(cpuDelta),
      `the controls cost ${cpuDelta.toFixed(4)} ms of main-thread time per frame, against ` +
        `+/-${MAX_TOUCH_CPU_DELTA_MS} ms`,
    ).toBeLessThan(MAX_TOUCH_CPU_DELTA_MS);
});
