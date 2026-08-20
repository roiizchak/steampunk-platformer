/**
 * Criterion G.7b — what the exit's art and the entry fade cost per frame.
 *
 * ## 🔴 Why a new spec exists at all, instead of a number added to 8.7
 *
 * Both perf gate-owner briefs concluded, independently, that **no statistic in the existing suite
 * can see this change**, and they were right on two counts:
 *
 *  - `sampleLevel` never moves the player. The camera stays at the spawn, the exit is a screen and a
 *    half away and is culled, and `stepGoalEntry` never leaves its `goalEntryTicks === null` early
 *    return. The feature is not running while 8.7 measures.
 *  - 8.7's statistic is a RATIO of level-05 to level-01. All three additions — one `stepGoalEntry`
 *    call per tick, one `goalEntryAlpha` plus `setAlpha` per frame, one image at depth 7 — are
 *    identical in both levels, so they divide out exactly. A ratio cannot see a constant.
 *
 * Per this project's own rule, **a statistic that cannot order its own mutation is not fixed by
 * moving its bound — it is replaced.** That is what this file is. It does not touch 8.7 or any other
 * existing gate.
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
 */

import { expect, test, type Page } from '@playwright/test';

import { bootToGame } from './gameHarness';
import { installGpuTimer } from './gpuTimer';
import { MIN_GPU_SAMPLES, MIN_SAMPLES, SAMPLE_TICKS } from './perfBudget';
import { median } from './levelPerf';
import { sample, type Sample } from './perfSampler';
import { assertRealGpu } from './realGpu';

/** Interleaved pairs. Matches 8.7's `PAIRS`, for the same reason: three is enough to median over. */
const PAIRS = 3;

/**
 * The ceiling on ONE exit's draw, in milliseconds of main-thread work per frame.
 *
 * ## 🔴 Why this is not a ratio, after a ratio was tried and thrown away
 *
 * The first version sampled *exit drawn* against *exit hidden* and compared medians. It measured:
 *
 * ```
 *   exit drawn   work 0.600 ms   gpu 0.161 ms
 *   exit hidden  work 0.400 ms   gpu 0.270 ms
 *   ratios       work 1.500      gpu 0.595
 * ```
 *
 * Neither number is a measurement. `performance.now()` is quantised to **0.1 ms** in this browser, so
 * `0.600` and `0.400` are adjacent steps on the clock's own grid and that 1.500 is the quantum, not
 * the gate. And the GPU arm says drawing an extra 124 416-pixel image made the frame **40 % faster** —
 * which is not a small effect measured imprecisely, it is noise with a sign.
 *
 * A bound over that could be set anywhere and would mean nothing anywhere, and this project's rule is
 * explicit: *a statistic that cannot order its own mutation is replaced, not re-bounded.*
 *
 * ## What replaced it: measure many, divide by many
 *
 * The standard answer to a signal under the timer's resolution — amplify until it clears, then divide
 * back down. `MUTATION_COPIES` extra exits are stacked on the real one: identical texture, size,
 * origin, depth and position, so the ONLY thing that changes is how much exit gets drawn. The delta
 * over that window divided by the number of copies is the per-exit cost, measured well above the
 * 0.1 ms grid instead of underneath it.
 *
 * This also makes the gate structurally able to go red: an exit that got twice as expensive to draw
 * doubles the measured delta and therefore the reported per-exit figure. The mutation is not a
 * separate test somebody has to remember to run — **it is how the measurement is taken.**
 *
 * ## The number
 *
 * Chosen on one set of runs and confirmed on a HELD-OUT set; both are recorded in
 * `docs/qa/phase-08-gate-entry.md`. A 60 Hz frame is 16.67 ms, so a per-exit cost in hundredths of a
 * millisecond is the finding — the bound exists to catch the day the exit stops being one static
 * image at depth 7.
 */
const MAX_EXIT_WORK_MS = 0.05;

/** The same ceiling on the GPU side, where the exit is 124 416 pixels of fill per frame. */
const MAX_EXIT_GPU_MS = 0.05;

/**
 * How many extra copies of the exit the measurement draws.
 *
 * 🔴 **The amplification IS the mutation the bound names** — same texture, same size, same depth,
 * same position, stacked. Nothing about the sim, the tilemap or the cull changes, so if the delta
 * moves, the only thing that moved is how much exit got drawn.
 *
 * 40, because that is what it takes to clear a 0.1 ms clock grid: 40 exits at 288 x 432 is roughly
 * 2.5 screens of extra fill, which a GPU timer can resolve and a quantised `performance.now()` can
 * too.
 */
const MUTATION_COPIES = 40;

/**
 * A second, smaller amplification — and the reason it exists.
 *
 * 🔴 Codex's implementation review made the fair objection that `(41 exits − 1 exit) / 40` is a
 * MARGINAL cost, not a total one: it omits whatever the first gate costs that the next forty do not,
 * and stacking co-located identical images could hit a batching or overdraw path a lone image never
 * takes. Divide by forty and any of that becomes invisible.
 *
 * The answer is not to argue about it, it is to measure whether the thing is linear. If the per-exit
 * figure at 20 copies and at 40 copies agree, the cost scales with the number drawn and the division
 * is sound. If they disagree badly, the inference is broken and the spec says so instead of
 * reporting a number.
 */
const HALF_COPIES = 20;

/** How far apart the two per-exit estimates may sit before the amplify-and-divide inference fails. */
const MAX_LINEARITY_SPREAD = 4;

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
      __gateBloat?: unknown[];
    };
    return {
      armed: scene.simWorld.goalEntryTicks !== null || scene.simWorld.completed,
      onScreen: Boolean(scene.goalObject?.willRender(scene.cameras.main)),
      copies: (scene.__gateBloat ?? []).length,
    };
  });
}

/** Stack `copies` more exits on the real one, or clear them. The amplifier. */
async function setExitCopies(page: Page, copies: number): Promise<void> {
  await page.evaluate((n) => {
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
            setDisplaySize(w: number, h: number): { setDepth(d: number): { destroy(): void } };
          };
        };
      };
      __gateBloat?: { destroy(): void }[];
    };
    for (const o of scene.__gateBloat ?? []) o.destroy();
    scene.__gateBloat = [];
    const g = scene.goalObject;
    if (!g) throw new Error('no exit to multiply');
    for (let i = 0; i < n; i += 1) {
      scene.__gateBloat.push(
        scene.add
          .image(g.x, g.y, g.texture.key)
          .setOrigin(g.originX, g.originY)
          .setDisplaySize(g.displayWidth, g.displayHeight)
          .setDepth(7),
      );
    }
  }, copies);
}

/** Set the copy count, confirm it landed, then sample one window. */
async function sampleArm(page: Page, copies: number): Promise<Sample> {
  await setExitCopies(page, copies);
  const state = await exitState(page);
  expect(state.copies, 'the copy count did not land, so both arms drew the same thing').toBe(copies);
  expect(state.onScreen, 'the exit left the screen, so this window measures nothing').toBe(true);
  expect(state.armed, 'the run-in armed — the sim freezes and the sampler will hang').toBe(false);
  return sample(page, SAMPLE_TICKS);
}

test.describe('G.7b — the frame cost of the exit', () => {
  test.setTimeout(240_000);

  test('one exit costs a fraction of a millisecond a frame, measured by amplification', async ({
    page,
  }) => {
    await bootToGame(page);
    const renderer = await assertRealGpu(page, 'G.7b');
    await installGpuTimer(page);
    await parkAtExit(page);

    const one: Sample[] = [];
    const half: Sample[] = [];
    const many: Sample[] = [];
    for (let i = 0; i < PAIRS; i += 1) {
      // The order alternates: three A-then-B rounds would give every A a cooler machine.
      if (i % 2 === 0) {
        one.push(await sampleArm(page, 0));
        half.push(await sampleArm(page, HALF_COPIES));
        many.push(await sampleArm(page, MUTATION_COPIES));
      } else {
        many.push(await sampleArm(page, MUTATION_COPIES));
        half.push(await sampleArm(page, HALF_COPIES));
        one.push(await sampleArm(page, 0));
      }
    }
    await setExitCopies(page, 0);

    for (const s of [...one, ...half, ...many]) {
      expect(s.frames, 'too few frames served to say anything').toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(s.ticks, 'the window spanned no sim ticks').toBeGreaterThan(0);
    }
    expect(one[0]!.gpuSupported, 'no GPU timing, so half of this was never measured').toBe(true);
    expect(median(one.map((s) => s.gpuSamples))).toBeGreaterThanOrEqual(MIN_GPU_SAMPLES);

    const oneWork = median(one.map((s) => s.workMedianMs));
    const manyWork = median(many.map((s) => s.workMedianMs));
    const oneGpu = median(one.map((s) => s.gpuMedianMs));
    const manyGpu = median(many.map((s) => s.gpuMedianMs));

    // The amplified delta, divided back down. Floored at 0 because a delta under the noise can come
    // back slightly negative, and "the exit costs less than nothing" is not a claim worth asserting —
    // it is the same statement as "under the floor", which is what the bound then reads.
    const perExitWork = Math.max(0, (manyWork - oneWork) / MUTATION_COPIES);
    const perExitGpu = Math.max(0, (manyGpu - oneGpu) / MUTATION_COPIES);

    // The same estimate taken at half the amplification. If the cost is linear in the number drawn,
    // these two agree and the division above is sound.
    const halfGpu = median(half.map((s) => s.gpuMedianMs));
    const perExitGpuHalf = Math.max(0, (halfGpu - oneGpu) / HALF_COPIES);

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `[G.7b] renderer ${renderer}`,
        `       1 exit      work ${oneWork.toFixed(3)} ms   gpu ${oneGpu.toFixed(3)} ms`,
        `       ${MUTATION_COPIES + 1} exits    work ${manyWork.toFixed(3)} ms   gpu ${manyGpu.toFixed(3)} ms`,
        `       ${HALF_COPIES + 1} exits    work ${median(half.map((s) => s.workMedianMs)).toFixed(3)} ms   gpu ${halfGpu.toFixed(3)} ms`,
        `       per exit    work ${perExitWork.toFixed(4)} ms   gpu ${perExitGpu.toFixed(4)} ms`,
        `       per exit at ${HALF_COPIES}          gpu ${perExitGpuHalf.toFixed(4)} ms   (linearity check)`,
        `       bounds      work ${MAX_EXIT_WORK_MS} ms   gpu ${MAX_EXIT_GPU_MS} ms`,
        '',
      ].join('\n'),
    );

    // 🔴 The premise the whole measurement rests on: the amplifier has to have DONE something. If 40
    // extra exits cost nothing measurable, the divisor is dividing noise, and the bound below would
    // pass for any exit at all — including a ruinously expensive one.
    expect(
      manyGpu,
      `${MUTATION_COPIES} extra exits did not cost the GPU anything — the amplifier is not amplifying, ` +
        'so the per-exit figure is noise over 40 and this gate is measuring nothing',
    ).toBeGreaterThan(oneGpu);

    // 🔴 LINEARITY. Without this the division is an assumption, not a measurement — Codex's
    // implementation review, finding 3. Two independent estimates of the same quantity, taken at
    // different amplifications; if the cost of drawing the exit scales with how many are drawn, they
    // agree. A ratio rather than a difference, because both are tiny and an absolute tolerance would
    // be a bound on noise.
    const spread =
      Math.max(perExitGpu, perExitGpuHalf) / Math.max(1e-6, Math.min(perExitGpu, perExitGpuHalf));
    expect(
      spread,
      `the per-exit cost measured at ${HALF_COPIES} copies (${perExitGpuHalf.toFixed(4)} ms) and at ` +
        `${MUTATION_COPIES} (${perExitGpu.toFixed(4)} ms) disagree by ${spread.toFixed(1)}x. The cost ` +
        'does not scale with the number drawn, so dividing the delta by the count is not a per-exit ' +
        'figure and this gate is not measuring what it says it is.',
    ).toBeLessThan(MAX_LINEARITY_SPREAD);

    expect(perExitWork, 'the exit costs the main thread more per frame than it should').toBeLessThan(
      MAX_EXIT_WORK_MS,
    );
    expect(perExitGpu, 'the exit costs the GPU more per frame than it should').toBeLessThan(
      MAX_EXIT_GPU_MS,
    );
  });
});
