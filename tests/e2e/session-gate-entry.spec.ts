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
import { PROGRESS_KEY, unlockAll } from './levelPerf';
import { GATE_PX } from '../../src/scenes/goalArtSize';
import { GOAL_ENTRY_TICKS, harvestFade, startFadeSampler } from './fadeSampler';

/**
 * The sim's OWN trigger rect, read live off the scene through `__phaserGame`.
 *
 * Not a typed-in `8640` *(vault 4.11)*, and not the `.tmj` re-parsed here either — `@types/node` is
 * not a dependency of this project and Phase 1 twice declined to add one. The live rect is the
 * better comparand anyway: the claim under test is *the drawn gate stands where the trigger is*, and
 * `getBounds()` is the extent after every transform, origin and display-size the scene applied. An
 * offset draw, a wrong origin or a letterboxed image separates the two; nothing about reading them
 * from one world makes them agree.
 */
interface TriggerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function triggerRect(page: import('@playwright/test').Page): Promise<TriggerRect | null> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      simWorld: { goal: { x: number; y: number; w: number; h: number } | null };
    };
    const g = scene.simWorld.goal;
    return g ? { x: g.x, y: g.y, w: g.w, h: g.h } : null;
  });
}

/**
 * Switch the running game to another level and wait until it is the one on screen.
 *
 * The same seam `levelPerf.ts` uses. Waiting on `__game.levelId` rather than on a timeout is what
 * makes this deterministic — the scene start is asynchronous and the old scene's objects survive
 * for a frame or two after it.
 */
async function startLevel(page: import('@playwright/test').Page, levelId: string): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as { __phaserGame: { scene: { start(k: string, d: unknown): void } } }
    ).__phaserGame.scene.start('Game', { levelId: id });
  }, levelId);
  await page.waitForFunction(
    (id) => (window as unknown as { __game: { levelId: string | null; ready: boolean } }).__game.levelId === id,
    levelId,
    { timeout: BOOT_TIMEOUT },
  );
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

  test('the drawn exit stands ON its trigger rect, and is bigger than the courier', async ({ page }) => {
    await bootToGame(page);
    const goal = await drawnGoal(page);
    expect(goal).not.toBeNull();
    // 🔴 The art is authored at `GATE_PX` — 288 x 432 — which is deliberately LARGER than the
    // 192 x 288 rect it triggers on. It was authored at the rect's size, and that made the doorway
    // exactly as tall as the 132 x 288 courier walking through it. Every assertion here compared
    // the drawing to the rect and passed; the owner found it by looking at a screenshot.
    expect(typeof goal!.bounds.w).toBe('number');
    expect(Math.round(goal!.bounds.w)).toBe(GATE_PX.w);
    expect(Math.round(goal!.bounds.h)).toBe(GATE_PX.h);

    // 🔴 Size alone was the whole assertion until the gate's adversarial QA brief pointed out that
    // a correctly-sized image drawn 500 px from its trigger passes every word of it. That is the
    // same defect `completeHelpers.ts` records for the GREY BOX — an object whose transform read
    // (0, 0) while it drew somewhere else entirely — arriving through the image branch instead.
    // The player would fade into empty air beside a door they never entered.
    //
    const trigger = await triggerRect(page);
    expect(trigger, 'the level carries no goal rect, so nothing below is a measurement').not.toBeNull();
    expect(typeof goal!.bounds.x).toBe('number');

    // Anchored BOTTOM-CENTRE on the rect: the door stands on the threshold the sim tests and grows
    // upward and outward from it. Anything else — centring on the rect, or top-left — sinks its base
    // into the floor or floats it, and both look like a bug rather than a doorway.
    const rectCentreX = trigger!.x + trigger!.w / 2;
    const rectBottom = trigger!.y + trigger!.h;
    expect(Math.round(goal!.bounds.x + goal!.bounds.w / 2), 'the gate is not centred on its trigger').toBe(
      rectCentreX,
    );
    expect(Math.round(goal!.bounds.y + goal!.bounds.h), 'the gate does not stand on the threshold').toBe(
      rectBottom,
    );

    // And the claim the owner actually made: it has to be bigger than the character.
    expect(goal!.bounds.h, 'the doorway is no taller than the courier walking through it').toBeGreaterThan(
      trigger!.h,
    );
  });

  /**
   * 🔴 The criterion says *"in all 5 levels"* and every browser assertion above sees only level 01.
   *
   * `bootToGame` always lands on level 01 (`BootScene` starts `Game` with `{ levelId: null }`), so
   * the other four were covered by a one-time hands-on pass and by unit tests that read level DATA.
   * Neither of those watches a drawn object. Raised by the gate's checklist review.
   *
   * `scene.start('Game', { levelId })` is the seam the perf suite already uses to move between
   * levels, and waiting on `__game.levelId` is how it knows the new scene is live — no new debug
   * field, no `waitForTimeout`.
   */
  for (const levelId of ['level-01', 'level-02', 'level-03', 'level-04', 'level-05']) {
    test(`${levelId} draws its exit from the art, at its own trigger rect`, async ({ page }) => {
      // 🔴 The levels are LOCKED, and finding that out is half of what this test bought.
      //
      // `resolveEntryLevel` (`src/sim/progress.ts`) refuses a level the save has not unlocked and
      // silently falls back to `order[0]`, so the first version of this test asked for level-02,
      // was handed level-01, and timed out waiting for a level id that was never going to arrive.
      // That is the game working correctly. Seeding the same save the perf suite seeds is the
      // supported way in — not a workaround, the actual mechanism.
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key, value),
        [PROGRESS_KEY, unlockAll()] as const,
      );
      await bootToGame(page);
      await startLevel(page, levelId);

      const goal = await drawnGoal(page);
      const trigger = await triggerRect(page);
      expect(goal, `${levelId}: nothing was drawn for the exit`).not.toBeNull();
      expect(trigger, `${levelId}: the level carries no goal rect`).not.toBeNull();

      expect(typeof goal!.willRender).toBe('boolean');
      expect(goal!.willRender, `${levelId}: the exit exists but the GPU would not draw it`).toBe(true);
      expect(goal!.depth).toBe(7);
      expect(Math.round(goal!.bounds.w)).toBe(GATE_PX.w);
      expect(Math.round(goal!.bounds.h)).toBe(GATE_PX.h);
      expect(
        Math.round(goal!.bounds.x + goal!.bounds.w / 2),
        `${levelId}: drawn away from its trigger`,
      ).toBe(trigger!.x + trigger!.w / 2);
      expect(
        Math.round(goal!.bounds.y + goal!.bounds.h),
        `${levelId}: not standing on its threshold`,
      ).toBe(trigger!.y + trigger!.h);
    });
  }
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
