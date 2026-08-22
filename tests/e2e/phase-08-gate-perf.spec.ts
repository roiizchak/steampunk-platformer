/**
 * Criterion G.7b — what the exit's art costs per frame.
 *
 * ## 🔴 Why a separate spec exists at all, instead of a number added to 8.7
 *
 * Both Phase 8 perf gate-owner briefs concluded, independently, that **no statistic in the existing
 * suite can see this change**, and they were right on two counts:
 *
 *  - `sampleLevel` never moves the player. The camera stays at the spawn, the exit is a screen and a
 *    half away and is culled, and `stepGoalEntry` never leaves its `goalEntryTicks === null` early
 *    return. The feature is not running while 8.7 measures.
 *  - 8.7's statistic is a RATIO of level-05 to level-01. All three additions — one `stepGoalEntry`
 *    call per tick, one `goalEntryAlpha` plus `setAlpha` per frame, one image at depth 7 — are
 *    identical in both levels, so they divide out exactly. A ratio cannot see a constant.
 *
 * ## What is measured, and what deliberately is not
 *
 * The **draw**, which is the only one of the three additions this harness can isolate:
 *
 *  - `goalEntryAlpha` + `sprite.setAlpha` run on **every frame of every arm** — they are
 *    unconditional in `renderPlayerSprite` — so they divide out of any A/B exactly as they divide out
 *    of 8.7's. Isolating them needs a source mutation, and one property write per frame against a
 *    16.67 ms budget is far below anything measurable here. **Stated, not measured**, which is the
 *    honest way round: *an A/B toggle bounds what it can show*, and whatever every arm runs is
 *    invisible to it.
 *  - `stepGoalEntry` early-returns unless the body overlaps the rect. The window where it does real
 *    work is **20 ticks**, about three animation frames at this harness's frame rate — fewer samples
 *    than a median needs, and the level completes and freezes at the end of it. Not measurable as a
 *    steady state by construction. It is nine comparisons and an increment on a counter.
 *
 * ## The camera is parked by moving the BODY, and that is not cheating
 *
 * There is no other way to put the exit on screen: the camera follows the player and the debug
 * surface is closed at eight fields. The body is placed **short of the rect** so nothing arms — every
 * arm is ordinary steady play with the exit in view, which is exactly the frame the criterion is
 * about.
 *
 * ## 🔴 2026-08-22 — the linearity guard was flaky, and it was replaced
 *
 * `spread < 4` over two unpaired per-exit estimates red about 3 runs in 8. The failure, the four
 * times this project has now met its shape, the measurements, and every number this spec asserts
 * against live in **`exitCostBudget.ts`** — read its header before changing anything here.
 */

import { expect, test, type Page } from '@playwright/test';

import { bootToGame } from './gameHarness';
import { installGpuTimer } from './gpuTimer';
import {
  BASE_COPIES,
  CAPDRAW_LIMIT,
  FIT_HIGH,
  FIT_MID,
  MARGINAL_COPIES,
  MAX_EXIT_GPU_MS,
  MAX_EXIT_WORK_MS,
  MIN_SWEEP_GAP_GPU_MS,
  MIN_SWEEP_GAP_WORK_MS,
  installPerExitCostFixture,
  PER_EXIT_COST_MS,
  POOL_COPIES,
  ROUNDS,
  SWEEP_COPIES,
} from './exitCostBudget';
import { MIN_GPU_SAMPLES, MIN_SAMPLES, SAMPLE_TICKS } from './perfBudget';
import { median, medianPairedDelta } from './levelPerf';
import { sample, type Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';

declare const process: { env: Record<string, string | undefined> };

/** `PERF_MUTATION=capdraw` — the gap floors' red proof. `exitCostBudget.ts` owns the why. */
const MUTATION = process.env.PERF_MUTATION ?? '';

/**
 * Put the exit on screen, short of its own trigger rect, and clear the doorstep.
 *
 * 78 px short of the rect — 12 px clear of first overlap, since half the body is 66 px at scale 6 —
 * so `stepGoalEntry` stays in its early return, `entryLocked` is false and the level cannot complete
 * mid-window.
 *
 * 🔴 **The enemies have to go, and the first version of this spec found out the hard way.** Level 01
 * ships a scavenger patrol ending 96 px from this door. Parked at the threshold the player is inside
 * its aggro range, it charges, the knockback shoves the body INTO the rect, the run-in arms, twenty
 * ticks later the level completes and `tick()` freezes at step 0 — so `__game.tick` stops, the
 * tick-bounded sampler never reaches its span, and `page.evaluate` hangs until the test times out.
 * Both runs died at 240 s having measured nothing.
 *
 * They are cleared in **every arm identically**, so nothing about the comparison changes: this is a
 * measurement of drawing the exit, not of fighting next to it. `costLevelSize` already sets the
 * precedent for editing `scene.world` to shape a perf window.
 */
async function parkAtExit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      simWorld: {
        goal: { x: number; y: number; w: number; h: number } | null;
        player: { x: number; y: number; vx: number; grounded: boolean };
        enemies: { sentries: unknown[]; scavengers: unknown[] };
        projectiles: unknown[];
      };
    };
    const w = scene.simWorld;
    if (!w.goal) throw new Error('the level carries no goal rect');
    w.enemies.sentries.length = 0;
    w.enemies.scavengers.length = 0;
    w.projectiles.length = 0;
    w.player.x = w.goal.x - 78;
    w.player.y = w.goal.y + w.goal.h;
    w.player.vx = 0;
    w.player.grounded = true;
  });
  // The camera lerps toward the body; the exit is not on screen until it arrives. Waiting on the
  // OBJECT rather than on a clock — `willRender` is the question Phaser itself asks.
  await page.waitForFunction(
    () => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        goalObject?: { willRender(c: unknown): boolean };
        cameras: { main: unknown };
      };
      return Boolean(scene.goalObject?.willRender(scene.cameras.main));
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Is the exit on screen, did the run-in stay out of the way, and how many copies are drawn? */
async function exitState(page: Page): Promise<{ armed: boolean; onScreen: boolean; copies: number }> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      goalObject?: { willRender(c: unknown): boolean };
      cameras: { main: unknown };
      simWorld: { goalEntryTicks: number | null; completed: boolean };
      __gateBloat?: { visible: boolean }[];
    };
    return {
      armed: scene.simWorld.goalEntryTicks !== null || scene.simWorld.completed,
      onScreen: Boolean(scene.goalObject?.willRender(scene.cameras.main)),
      copies: (scene.__gateBloat ?? []).filter((o) => o.visible).length,
    };
  });
}

/**
 * Show `copies` extra exits stacked on the real one. The amplifier.
 *
 * 🔴 **The pool is built ONCE, at `POOL_COPIES`, and the arms toggle `visible`.** The first version
 * destroyed and re-created the whole stack between arms, which put up to 2560 allocations and their
 * collection immediately before — and often inside — the window being measured. That is a per-arm
 * cost with nothing to do with drawing an exit, it varies with whatever the collector felt like, and
 * it is the difference between the two 2026-08-22 selection runs: `k` read 1.000 and then 0.500 on
 * an unchanged tree. Pooling makes the display-list walk identical in every arm, so the ONLY thing
 * the delta contains is submission of the visible ones — which is what the criterion names.
 */
async function setExitCopies(page: Page, copies: number, pool: number): Promise<void> {
  await page.evaluate(
    ({ n, size }) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        goalObject?: {
          x: number;
          y: number;
          originX: number;
          originY: number;
          texture: { key: string };
          displayWidth: number;
          displayHeight: number;
        };
        add: {
          image(
            x: number,
            y: number,
            k: string,
          ): {
            setOrigin(x: number, y: number): {
              setDisplaySize(w: number, h: number): { setDepth(d: number): { setVisible(v: boolean): unknown } };
            };
          };
        };
        __gateBloat?: { visible: boolean }[];
      };
      const g = scene.goalObject;
      if (!g) throw new Error('no exit to multiply');
      if (!scene.__gateBloat || scene.__gateBloat.length !== size) {
        scene.__gateBloat = [];
        for (let i = 0; i < size; i += 1) {
          scene.__gateBloat.push(
            scene.add
              .image(g.x, g.y, g.texture.key)
              .setOrigin(g.originX, g.originY)
              .setDisplaySize(g.displayWidth, g.displayHeight)
              .setDepth(7)
              .setVisible(false) as { visible: boolean },
          );
        }
      }
      scene.__gateBloat.forEach((o, i) => {
        o.visible = i < n;
      });
    },
    { n: copies, size: pool },
  );
}

/** Set the copy count, confirm it landed, then sample one window. */
async function sampleArm(page: Page, copies: number): Promise<Sample> {
  const drawn = MUTATION === 'capdraw' ? Math.min(copies, CAPDRAW_LIMIT) : copies;
  await setExitCopies(page, drawn, POOL_COPIES);
  const state = await exitState(page);
  expect(state.copies, 'the copy count did not land, so both arms drew the same thing').toBe(drawn);
  expect(state.onScreen, 'the exit left the screen, so this window measures nothing').toBe(true);
  expect(state.armed, 'the run-in armed — the sim freezes and the sampler will hang').toBe(false);
  return sample(page, SAMPLE_TICKS);
}

test.describe('G.7b — the frame cost of the exit', () => {
  test.setTimeout(600_000);

  test('one exit costs a fraction of a millisecond a frame, measured by amplification', async ({
    page,
  }) => {
    await bootToGame(page);
    const renderer = await assertRealGpu(page, 'G.7b');
    await installGpuTimer(page);
    await parkAtExit(page);
    // The pool is built here, before any window, so no arm pays for creating it.
    await setExitCopies(page, 0, POOL_COPIES);
    if (MUTATION === 'perexit') {
      await installPerExitCostFixture(page, PER_EXIT_COST_MS);
    }

    // ── The sweep, walked in ALTERNATING order ────────────────────────────────────────────────
    // Round 0 forward, round 1 reversed, round 2 forward: three A-then-B rounds would give every
    // control a cooler machine than every amplified arm, which is the drift the pairing removes.
    const rows = new Map<number, Sample[]>(SWEEP_COPIES.map((n) => [n, [] as Sample[]]));
    for (let r = 0; r < ROUNDS; r += 1) {
      const order = r % 2 === 0 ? [...SWEEP_COPIES] : [...SWEEP_COPIES].reverse();
      for (const n of order) rows.get(n)!.push(await sampleArm(page, n));
    }
    await setExitCopies(page, 0, POOL_COPIES);

    const all = [...rows.values()].flat();
    for (const s of all) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(s.ticks, 'the window spanned no sim ticks').toBeGreaterThan(0);
    }
    const base = rows.get(BASE_COPIES)!;
    expect(base[0]!.gpuSupported, 'no GPU timing, so half of this was never measured').toBe(true);
    expect(median(base.map((s) => s.gpuSamples))).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);

    // 🔴 Every figure below is the MEDIAN OF THE PER-ROUND DELTAS, never the delta of two medians.
    // `medianPairedDelta`'s docstring carries why, and the 2026-08-22 readings that paid for it are
    // in this file's header.
    const workOf = (n: number): number[] => rows.get(n)!.map((s) => s.workMedianMs);
    const gpuOf = (n: number): number[] => rows.get(n)!.map((s) => s.gpuMedianMs);
    const workDelta = (n: number): number => medianPairedDelta(workOf(BASE_COPIES), workOf(n));
    const gpuDelta = (n: number): number => medianPairedDelta(gpuOf(BASE_COPIES), gpuOf(n));

    // The MARGINAL cost, not the total delta over the total count. The gap between the top two
    // sweep points contains only what the extra `MARGINAL_COPIES` cost: the ~0.5 ms the amplifier
    // charges for making any copies visible at all is in both points and subtracts out. That is
    // Codex's Phase 8 finding 3 answered by measurement - `exitCostBudget.ts` has the table.
    const workGap = (hi: number, lo: number): number => workDelta(hi) - workDelta(lo);
    const gpuGap = (hi: number, lo: number): number => gpuDelta(hi) - gpuDelta(lo);
    const perExitWork = Math.max(0, workGap(FIT_HIGH, FIT_MID) / MARGINAL_COPIES);
    const perExitGpu = Math.max(0, gpuGap(FIT_HIGH, FIT_MID) / MARGINAL_COPIES);

    const fmt = (v: number[]): string => v.map((x) => x.toFixed(3)).join('/');
    const detail = [
      '',
      `[G.7b] renderer ${renderer}${MUTATION ? `   MUTATION ${MUTATION}` : ''}`,
      ...SWEEP_COPIES.map(
        (n) =>
          `       ${String(n + 1).padStart(5)} exits  work ${fmt(workOf(n))}  gpu ${fmt(gpuOf(n))}` +
          `  frames ${rows.get(n)!.map((x) => x.frames).join('/')}` +
          `  per-round paired work ${fmt(workOf(n).map((v, i) => v - workOf(BASE_COPIES)[i]!))}` +
          `  gpu ${fmt(gpuOf(n).map((v, i) => v - gpuOf(BASE_COPIES)[i]!))}` +
          `  median work ${workDelta(n).toFixed(3)} gpu ${gpuDelta(n).toFixed(3)} ms`,
      ),
      `       sweep gaps  ` +
        SWEEP_COPIES.slice(1)
          .map(
            (n, i) =>
              `${SWEEP_COPIES[i]}->${n} work ${workGap(n, SWEEP_COPIES[i]!).toFixed(3)} ` +
              `gpu ${gpuGap(n, SWEEP_COPIES[i]!).toFixed(3)} ms`,
          )
          .join(', ') +
        `  (floors work ${MIN_SWEEP_GAP_WORK_MS}, gpu ${MIN_SWEEP_GAP_GPU_MS})`,
      `       per exit, marginal over the top ${MARGINAL_COPIES} copies:` +
        `   work ${perExitWork.toFixed(5)} ms (bound ${MAX_EXIT_WORK_MS})` +
        `   gpu ${perExitGpu.toFixed(5)} ms (bound ${MAX_EXIT_GPU_MS})`,
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(detail);

    // -- Guard 1: every gap in the sweep RESPONDS to the count ---------------------------------
    //
    // **The statistic that replaced `MAX_LINEARITY_SPREAD`**, and the thing that guard's error
    // message always claimed to be checking. A gap is a difference two medians of per-round paired
    // deltas apart, so the amplifier's count-independent cost cancels out of it and what is left is
    // exactly "did drawing more exit cost more". `PERF_MUTATION=capdraw` is the red proof.
    for (let i = 1; i < SWEEP_COPIES.length; i += 1) {
      const lo = SWEEP_COPIES[i - 1]!;
      const hi = SWEEP_COPIES[i]!;
      expect(
        gpuGap(hi, lo),
        `going from ${lo} to ${hi} extra exits cost the GPU ${gpuGap(hi, lo).toFixed(3)} ms more, ` +
          `under the ${MIN_SWEEP_GAP_GPU_MS} ms floor. The frame stopped getting more expensive ` +
          'when more exit was drawn, so dividing a delta by a copy count is not a per-exit figure ' +
          `and the ceilings below would pass for an exit of any cost at all.${detail}`,
      ).toBeGreaterThanOrEqual(MIN_SWEEP_GAP_GPU_MS);
      expect(
        workGap(hi, lo),
        `going from ${lo} to ${hi} extra exits cost the main thread ` +
          `${workGap(hi, lo).toFixed(3)} ms more, under the ${MIN_SWEEP_GAP_WORK_MS} ms floor. ` +
          'The frame stopped getting more expensive when more exit was drawn, so dividing a delta ' +
          `by a copy count is not a per-exit figure.${detail}`,
      ).toBeGreaterThanOrEqual(MIN_SWEEP_GAP_WORK_MS);
    }

    // -- Guard 2: the amplifier amplified, PER ROUND, on the GPU -------------------------------
    //
    // The premise the whole measurement rests on, and the reason it is per-round rather than on the
    // medians: the statistic this replaced compared two medians and read the amplifier as *cheaper*
    // than the control in 1 round of 6.
    const gpuBase = gpuOf(BASE_COPIES);
    gpuOf(FIT_HIGH).forEach((v, i) => {
      expect(
        v - gpuBase[i]!,
        `round ${i}: ${FIT_HIGH} extra exits cost the GPU ${(v - gpuBase[i]!).toFixed(4)} ms more ` +
          'than none - the amplifier is not amplifying in this round, so every figure taken from ' +
          `it is noise.${detail}`,
      ).toBeGreaterThan(0);
    });

    expect(perExitWork, 'the exit costs the main thread more per frame than it should').toBeLessThan(
      MAX_EXIT_WORK_MS,
    );
    expect(perExitGpu, 'the exit costs the GPU more per frame than it should').toBeLessThan(
      MAX_EXIT_GPU_MS,
    );
  });
});
