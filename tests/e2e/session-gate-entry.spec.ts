/**
 * The courier RUNS INTO the exit and fades, and the exit is real art — the gate-entry session.
 *
 * `goal-entry.test.ts` proves the sim: which tick arms, which tick completes, what the cancel does.
 * `player-view.test.ts` pins the alpha curve. Neither of them can see whether any of it reaches the
 * screen — deleting `renderPlayer()` once left every Phase 2 test green, because everything else
 * read `__game`, which the scene writes directly. This file watches the DRAWN sprite.
 *
 * ## 🔴 The sampling rule this spec is built around
 *
 * **A wait expressed in ticks cannot bound a sampling window**, and here that is not a style
 * preference: `tick()` returns before step 1 once the level completes, so `window.__game.tick`
 * **stops** and any helper waiting on a tick count hangs forever rather than timing out at a wrong
 * value. Every sample below is taken **inside the page, once per animation frame**, and only an
 * aggregate crosses back.
 *
 * ## Why the alpha is sampled as a SERIES and not as an end state
 *
 * *"The player is invisible at the end"* is true of a sprite that was never drawn, of a sprite that
 * blinked out at the threshold, and of a real fade. The unit suite already proved that: with the
 * fade made instant, the assertion named `reaches exactly 0` still passed. So this asserts the
 * shape, and only then that it ends at 0.
 *
 * ## 🔴 But the shape is asserted against the RAMP, not against frames — and that is not optional
 *
 * The first version counted *distinct alphas per animation frame* and required more than five. It
 * failed on the real build with **one**, and the feature was fine: the headless project renders at
 * roughly **11 fps** against a fixed 60 Hz sim, so a frame drains five or six ticks and the whole
 * 20-tick ramp spans about **three animation frames**. There are not five frames in the window to
 * have five alphas in.
 *
 * That is this project's oldest measurement trap, arriving from the other end. Phase 7 learned that
 * at ~240 fps a percentile over rAF frames cannot see a cost carried by 2 % of frames; here, at ~11
 * fps, a per-frame sampler cannot see a ramp that lasts a third of a second. **The bound was not
 * lowered to fit the harness** — the statistic was replaced with one the harness can actually
 * measure:
 *
 *   > Every alpha the sprite is ever drawn with must be a value ON the ramp — `1 − k/20` for some
 *   > whole `k` — it must never increase, and at least one must be strictly between 0 and 1.
 *
 * That holds at 11 fps and at 240 fps, it is what the fade actually claims, and it still refuses an
 * instant blink (nothing strictly between 0 and 1), a wrong curve (values off the ramp), and a
 * pop-back (an increase). Pairing each alpha with the counter observed in the same callback was
 * rejected: the sampler and Phaser's update run in an unspecified order within a frame, so the pair
 * can be skewed by one tick through no fault of the code under test.
 */

import { expect, test } from '@playwright/test';

import { BOOT_TIMEOUT, bootToGame } from './gameHarness';
import { drawnGoal } from './completeHelpers';
import { RUN_TIMEOUT, playToExit } from './levelDriver';

/** Must match `GOAL_ENTRY_TICKS` in `src/sim/goal.ts`. Asserted below rather than assumed. */
const GOAL_ENTRY_TICKS = 20;

interface FadeReport {
  /** Did the level actually finish? Everything else is meaningless if not. */
  completed: boolean;
  samples: number;
  /** Frames on which the run-in was armed (`goalEntryTicks !== null`). */
  armedFrames: number;
  /** Every distinct alpha the sprite was drawn with, in first-seen order. */
  alphasSeen: number[];
  /** Those that are NOT a value on the `1 - k/20` ramp. Must be empty. */
  offRamp: number[];
  /** How many were strictly between 0 and 1 — the partially-faded frames a blink cannot produce. */
  partialCount: number;
  /** True if alpha ever rose after it first fell. */
  roseAgain: boolean;
  finalAlpha: number;
  /** Every animation key seen while the run-in owned the body. */
  animsWhileArmed: string[];
  /** Alphas seen in the frames sampled AFTER completion latched. */
  tailAlphas: number[];
  /** The counter's first and last observed values. */
  counterRange: [number, number] | null;
}

/**
 * Install a per-frame sampler and LEAVE IT RUNNING.
 *
 * 🔴 **It has to be installed before the level is driven, and the first version was not.**
 * `playToExit` waits on `world.completed`, so a sampler started after it returns begins life on an
 * already-finished level: it saw one alpha (`0`), a counter frozen at 20, and reported *"the courier
 * was never drawn partially faded"*. That is a true statement about a window it had entirely missed,
 * and it reads exactly like a blink-out defect — two of the three shape assertions were red for a
 * feature that works.
 */
async function startFadeSampler(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __fade?: { alphas: number[]; counters: number[]; anims: string[]; raf: number };
    };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      playerSprite: { alpha: number; anims?: { currentAnim?: { key: string } } };
      simWorld: { completed: boolean; goalEntryTicks: number | null };
    };
    const store = { alphas: [] as number[], counters: [] as number[], anims: [] as string[], raf: 0 };
    const step = () => {
      store.alphas.push(Number(scene.playerSprite.alpha.toFixed(4)));
      if (scene.simWorld.goalEntryTicks !== null) {
        store.counters.push(scene.simWorld.goalEntryTicks);
        const key = scene.playerSprite.anims?.currentAnim?.key;
        if (key && !store.anims.includes(key)) store.anims.push(key);
      }
      store.raf = requestAnimationFrame(step);
    };
    store.raf = requestAnimationFrame(step);
    w.__fade = store;
  });
}

/** Run past completion to catch a pop-back, stop the sampler, and aggregate inside the page. */
async function harvestFade(page: import('@playwright/test').Page): Promise<FadeReport> {
  return page.evaluate(async (entryTicks: number) => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __fade: { alphas: number[]; counters: number[]; anims: string[]; raf: number };
    };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      playerSprite: { alpha: number };
      simWorld: { completed: boolean };
    };

    // 60 further frames purely to catch a pop-back after the level-complete panel appears.
    const tail: number[] = [];
    for (let j = 0; j < 60; j += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      tail.push(Number(scene.playerSprite.alpha.toFixed(4)));
    }
    cancelAnimationFrame(w.__fade.raf);

    const alphas = w.__fade.alphas;
    const counters = w.__fade.counters;
    const anims = w.__fade.anims;

    let roseAgain = false;
    let seenFall = false;
    for (let i = 1; i < alphas.length; i += 1) {
      const delta = alphas[i - 1]! - alphas[i]!;
      if (delta > 0) seenFall = true;
      else if (delta < 0 && seenFall) roseAgain = true;
    }

    // Is this value a step on the `1 - k/20` ramp? Compared with a tolerance because the sprite's
    // alpha is a float and the report rounds to four places.
    const onRamp = (a: number) => {
      for (let k = 0; k <= entryTicks; k += 1) {
        if (Math.abs(a - Math.max(0, 1 - k / entryTicks)) < 1e-3) return true;
      }
      return false;
    };
    const distinct = [...new Set(alphas)];

    return {
      completed: scene.simWorld.completed,
      samples: alphas.length,
      armedFrames: counters.length,
      alphasSeen: distinct,
      offRamp: distinct.filter((a) => !onRamp(a)),
      partialCount: distinct.filter((a) => a > 0 && a < 1).length,
      roseAgain,
      finalAlpha: alphas.length ? alphas[alphas.length - 1]! : Number.NaN,
      animsWhileArmed: [...anims],
      tailAlphas: [...new Set(tail)],
      counterRange: counters.length ? [counters[0]!, counters[counters.length - 1]!] : null,
    };
  }, GOAL_ENTRY_TICKS);
}

test.describe('the exit is generated art, not a grey box', () => {
  test('`goal-gate` is loaded and the exit draws from it', async ({ page }) => {
    await bootToGame(page);

    const state = await page.evaluate(() => {
      const game = (
        window as unknown as {
          __phaserGame: { textures: { exists(k: string): boolean } };
        }
      ).__phaserGame;
      return { hasTexture: game.textures.exists('goal-gate') };
    });

    // Assert the TYPE before the value — an `undefined` here would make the negative vacuous.
    expect(typeof state.hasTexture).toBe('boolean');
    expect(state.hasTexture, 'the goal-gate texture never loaded, so drawGoal fell back to the grey box').toBe(
      true,
    );

    const goal = await drawnGoal(page);
    expect(goal).not.toBeNull();
    expect(typeof goal!.willRender).toBe('boolean');
    expect(goal!.willRender, 'the exit exists but the GPU would not draw it').toBe(true);
    expect(goal!.depth, 'depth 7: under gears, enemies and the player, because you walk THROUGH it').toBe(7);
  });

  test('the drawn exit is the size of the goal rect it triggers on', async ({ page }) => {
    await bootToGame(page);
    const goal = await drawnGoal(page);
    expect(goal).not.toBeNull();
    // The art is authored at 192 x 288, so `setDisplaySize` is a no-op and this is 1:1. If the
    // image were letterboxed or mis-scaled, the drawn extent would stop matching the trigger volume
    // and a player could stand "inside the door" while the sim disagreed.
    expect(typeof goal!.bounds.w).toBe('number');
    expect(Math.round(goal!.bounds.w)).toBe(192);
    expect(Math.round(goal!.bounds.h)).toBe(288);
  });
});

test.describe('the courier runs in and fades', () => {
  test.setTimeout(RUN_TIMEOUT + BOOT_TIMEOUT);

  test('fades to 0 over many frames, plays `run` throughout, and never pops back', async ({ page }) => {
    await bootToGame(page);
    // The sampler goes in FIRST -- see its own note. playToExit returns only once the level is
    // already finished, so installing it afterwards measures an empty window.
    await startFadeSampler(page);
    await playToExit(page);

    const report = await harvestFade(page);

    // Premise first. Every assertion below is meaningless against a level that never finished.
    expect(typeof report.completed).toBe('boolean');
    expect(report.completed, 'the level never completed, so nothing below is a measurement').toBe(true);
    expect(report.armedFrames, 'the run-in never armed').toBeGreaterThan(0);

    // The counter is the sim's, and it must have run its full window.
    expect(report.counterRange).not.toBeNull();
    expect(report.counterRange![1]).toBe(GOAL_ENTRY_TICKS);

    // 🔴 The shape, asserted against the RAMP rather than against frames — see the header. These
    // three hold at 11 fps and at 240 fps, which is the whole point.
    expect(
      report.offRamp,
      `the sprite was drawn with alphas that are not on the 1 - k/${GOAL_ENTRY_TICKS} ramp`,
    ).toEqual([]);
    expect(
      report.partialCount,
      'the courier was never drawn PARTIALLY faded — that is a blink-out, not a fade',
    ).toBeGreaterThan(0);
    expect(report.roseAgain, 'the sprite brightened again mid-fade').toBe(false);

    // Only now the end state.
    expect(report.finalAlpha).toBe(0);

    // No pop-back after the level-complete panel. The sim is frozen, so this is structural — but
    // it is exactly the kind of structural claim that a stray `setAlpha(1)` somewhere would break.
    expect(report.tailAlphas, 'the courier reappeared after the level completed').toEqual([0]);

    // The run animation, for the whole sequence.
    expect(report.animsWhileArmed).toEqual(['brass-courier-run']);
  });
});
