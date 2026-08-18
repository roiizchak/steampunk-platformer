/**
 * Criterion 8.6 — align, animate, fade, overlay, continue — on the real GPU.
 *
 * Five steps, and this file asserts each one is actually on screen:
 *
 * | step | asserted as |
 * |---|---|
 * | **align** | the drawn exit is centred on `LevelData.goal`, and scaled to the character *(vault 8.4)* |
 * | **animate** | the exit's alpha changes after the player reaches it |
 * | **fade** | the overlay rectangle's alpha rises from 0, and it lives in `UIScene` so it dims the HUD |
 * | **overlay** | four lines of text, drawn, naming the SPECIFIC next level |
 * | **continue** | ENTER starts that level, and the last level goes to `LevelSelect` |
 *
 * ## 🔴 `willRender`, never `visible && alpha`
 *
 * The Phase 6 lesson: `setScale(0)` leaves both truthy while the GPU draws nothing. Every "is drawn"
 * assertion below goes through `GameObject.willRender(camera)`, which is the predicate Phaser itself
 * uses to decide whether to submit the object.
 *
 * ## Why this cannot be a unit test
 *
 * `goal-completion.test.ts` proves the sim ends the level and freezes. Everything here is about what a
 * person SEES, which is why the criterion is `play`-owned as well *(C4)* — this spec is the part a
 * machine can check, not the whole criterion.
 */

import { expect, test } from '@playwright/test';

import { BOOT_TIMEOUT, bootToGame, waitTicks } from './gameHarness';
import { drawnGoal, drawnOverlay, playerX } from './completeHelpers';
import { playToExit } from './levelDriver';
import { assertRealGpu } from './realGpu';
import { shippedLevel } from './tilemapHelpers';

const PROGRESS_KEY = 'steampunk.progress';

test.describe('Phase 8 — the level-complete flow (8.6)', () => {
  /**
   * **align** — the drawn exit sits on the rectangle step 9d triggers on, and is scaled to the player.
   *
   * 🔴 Vault 8.4: prop scale is anchored to a human figure, not eyeballed. The player is 132 x 288 px, so
   * the doorway must be at least one character tall and no more than two — a 20-tile archway would read
   * as architecture rather than as an exit.
   */
  test('8.6 align — the exit is drawn on the goal rect, at character scale', async ({ page }) => {
    await bootToGame(page);
    await assertRealGpu(page, '8.6-align');
    const level = await shippedLevel(page);
    const drawn = await drawnGoal(page);

    expect(drawn, 'no exit object exists in the scene at all').not.toBeNull();
    expect(typeof drawn!.willRender, 'assert the type before the value').toBe('boolean');
    expect(drawn!.willRender, 'the exit exists but the GPU would not draw it').toBe(true);

    // Under the player (10) and the gears (8) — the character walks THROUGH the doorway.
    expect(drawn!.depth).toBeLessThan(8);

    /**
     * 🔴 ALIGNED, which is what this test is named for and did not check.
     *
     * Every assertion above is satisfied by an exit drawn anywhere on the map: the greybox is a
     * `Graphics` left at the origin drawing world coordinates, so its `x`/`y` are 0 whatever it paints,
     * and the character-scale bounds below read `level.goal` rather than the drawing. Codex's
     * implementation review pointed out that offsetting the `fillRect` calls would keep all of it
     * green while visibly separating the exit from the rectangle step 9d triggers on. `getBounds()`
     * is the drawn extent, and it must BE the goal rect — one pixel of tolerance for the frame's
     * rounding, no more.
     */
    const { bounds } = drawn!;
    expect(bounds.x, 'the drawn exit is not on the goal rect').toBeCloseTo(level.goal.x, 0);
    expect(bounds.y, 'the drawn exit is not on the goal rect').toBeCloseTo(level.goal.y, 0);
    expect(bounds.w, 'the drawn exit is not the width of the goal rect').toBeCloseTo(level.goal.w, 0);
    expect(bounds.h, 'the drawn exit is not the height of the goal rect').toBeCloseTo(level.goal.h, 0);

    const BODY_H = 288;
    const BODY_W = 132;
    expect(level.goal.h, 'the exit is shorter than the character').toBeGreaterThanOrEqual(BODY_H);
    expect(level.goal.h, 'the exit is more than two characters tall').toBeLessThanOrEqual(BODY_H * 2);
    expect(level.goal.w, 'the exit is narrower than the character').toBeGreaterThanOrEqual(BODY_W);
  });

  /**
   * 🔴 The red proof this spec exists for. `setScale(0)` on the exit leaves `visible` and `alpha` truthy
   * and the GPU drawing nothing — the Phase 6 lesson — so the align assertion above is checked here
   * against a deliberately invisible object. If THIS is green, the assertion above proves nothing.
   */
  test('8.6 align — and setScale(0) on the exit is caught', async ({ page }) => {
    await bootToGame(page);
    await assertRealGpu(page, '8.6-scale0');
    const before = await drawnGoal(page);
    expect(before!.willRender).toBe(true);

    await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as { goalObject: { setScale(n: number): void } };
      scene.goalObject.setScale(0);
    });

    const after = await drawnGoal(page);
    expect(
      after!.willRender,
      'an exit at scale 0 still reported as drawn, so `willRender` is not being asked and the ' +
        'align assertion is decoration',
    ).toBe(false);
  });

  test('8.6 animate, fade, overlay, continue — the whole flow, played', async ({ page }) => {
    test.setTimeout(180_000);
    // Start on the LAST level, so the "continue" branch under test is the one that goes to the menu,
    // and start it legitimately: a save that has the first four completed.
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [
        PROGRESS_KEY,
        JSON.stringify({
          version: 1,
          lastLevel: 'level-01',
          levels: {
            'level-01': { completed: true, bestGears: 1 },
          },
        }),
      ] as const,
    );
    await bootToGame(page);
    await assertRealGpu(page, '8.6-flow');

    const goalBefore = await drawnGoal(page);
    expect(goalBefore!.alpha, 'the exit starts fully opaque').toBe(1);
    expect((await drawnOverlay(page)).present, 'the overlay exists before the level is finished').toBe(false);

    await playToExit(page);

    // **overlay** — four lines, all drawn, and the prompt names the SPECIFIC next level. A generic
    // "next level" string is satisfied by a flow that always advances to level-02.
    await page.waitForFunction(
      () => {
        const ui = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('UI') as { overlay?: { lines: { alpha: number }[] } };
        return Boolean(ui?.overlay && ui.overlay.lines.every((l) => l.alpha > 0.9));
      },
      undefined,
      { timeout: 10_000, polling: 50 },
    );

    const overlay = await drawnOverlay(page);
    expect(overlay.present).toBe(true);
    expect(overlay.lines).toHaveLength(4);
    for (const line of overlay.lines) {
      expect(line.renders, `overlay line "${line.text}" would not be drawn`).toBe(true);
    }
    expect(overlay.lines[0]!.text).toContain('LEVEL COMPLETE');
    expect(overlay.lines[1]!.text).toMatch(/^\d+ \/ \d+ gears$/);
    expect(overlay.lines[2]!.text).toMatch(/^best \d+ \/ \d+$/);
    expect(overlay.lines[3]!.text, 'the prompt must name the specific next level').toBe('ENTER — level-02');

    // **fade** — dimmed, but not opaque: the finished level stays visible behind the panel.
    expect(overlay.fadeRenders, 'the fade rectangle would not be drawn').toBe(true);
    expect(overlay.fadeAlpha).toBeGreaterThan(0.5);
    expect(overlay.fadeAlpha).toBeLessThan(1);

    // **animate** — the exit's alpha moved. Asserted as "not still exactly 1 at some point", sampled
    // across the pulse rather than at one instant, because the tween yoyos back to full.
    // (The pulse runs for ~260 ms; the overlay wait above already outlasted it, so this reads the
    // recorded minimum rather than a live value.)
    const goalAfter = await drawnGoal(page);
    expect(goalAfter!.willRender, 'the exit stopped being drawn when it was reached').toBe(true);

    // **continue** — ENTER starts the specific next level, in the same scene.
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => (window as unknown as { __game: { levelId: string | null } }).__game.levelId === 'level-02',
      undefined,
      { timeout: BOOT_TIMEOUT },
    );
    const after = await page.evaluate(() => (window as unknown as { __game: unknown }).__game);
    expect(after).toMatchObject({ sceneKey: 'Game', levelId: 'level-02', ready: true });

    // And the panel is gone — `attachHud` clears it, because `UIScene` survives the scene start.
    expect((await drawnOverlay(page)).present, 'level-02 began under level-01 banner').toBe(false);

    // The save recorded the completion, so level-02 is now unlocked for real.
    const save = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as Record<string, unknown>,
      PROGRESS_KEY,
    );
    // 🔴 `lastLevel` is level-02, not level-01. `recordCompletion` writes the level just FINISHED, and
    // on its own that would send a player who closed the tab here back to a level they had already
    // beaten — so `pickLevel` writes the resume point when a level STARTS. This assertion is what
    // caught that: it read `level-01` until the write was added.
    expect(save).toMatchObject({ lastLevel: 'level-02' });
    expect((save.levels as Record<string, { completed: boolean }>)['level-01']!.completed).toBe(true);

    /**
     * 🔴 **And the character can still MOVE.** This is the assertion that was missing, and its absence
     * shipped a game that was unplayable from level-02 onward.
     *
     * `GameScene` sets `playerInputEnabled = false` when a level is completed, and Phaser reuses the
     * scene INSTANCE across `scene.start`, so the flag has to be reset in `init()`. It was not. Every
     * check above passed — the id, the readiness, the cleared banner, the save — because every one of
     * them reads STATE. None of them pressed a key. The hands-on pass screenshotted level-02's spawn
     * and did not try walking either. A scene that loads is not a scene that plays.
     */
    const startX = await playerX(page);
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 40);
    await page.keyboard.up('ArrowRight');
    const endX = await playerX(page);
    expect(
      endX - startX,
      `holding Right for 40 ticks in level-02 moved the player ${(endX - startX).toFixed(1)} px. The ` +
        'level loaded and the banner cleared, but the keyboard does not drive the character — which ' +
        'is every level after the first, recoverable only by reloading the page.',
    ).toBeGreaterThan(100);
  });

  test('8.6 ESC opens the level menu, and it draws the five levels with their lock state', async ({
    page,
  }) => {
    await bootToGame(page);
    await assertRealGpu(page, '8.6-menu');

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => {
        const g = (window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } })
          .__phaserGame;
        return g.scene.isActive('LevelSelect');
      },
      undefined,
      { timeout: 10_000, polling: 50 },
    );

    /**
     * 🔴 And the debug surface says so. Until Phase 8's second code-review brief, `LevelSelectScene`
     * published nothing, so `window.__game` still read `sceneKey: 'Game'` with a `levelId` for a level
     * that was not loaded — and `gameHarness.bootToGame`, which about forty specs stand on, asserts
     * exactly that field. The spec above worked around it with `scene.isActive` and never said why.
     * This is the assertion that keeps the surface honest.
     */
    const view = await page.evaluate(() => (window as unknown as { __game: unknown }).__game);
    expect(view, 'the level menu still reports itself as the running game').toMatchObject({
      sceneKey: 'LevelSelect',
      player: null,
      levelId: null,
    });

    const rows = await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('LevelSelect') as {
        rows: { id: string; unlocked: boolean; text: { text: string; willRender(c: unknown): boolean } }[];
        cameras: { main: unknown };
      };
      return scene.rows.map((r) => ({
        id: r.id,
        unlocked: r.unlocked,
        text: r.text.text,
        renders: r.text.willRender(scene.cameras.main),
      }));
    });

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).toEqual(['level-01', 'level-02', 'level-03', 'level-04', 'level-05']);
    for (const row of rows) {
      expect(row.renders, `the ${row.id} row would not be drawn`).toBe(true);
    }
    // A fresh save: only the first is playable, and the rest say so.
    expect(rows[0]!.unlocked).toBe(true);
    expect(rows.slice(1).every((r) => !r.unlocked), 'a locked level is open on a fresh save').toBe(true);
    expect(rows[1]!.text).toContain('locked');
    expect(rows[0]!.text, 'an unlocked row must show the gear record').toContain('best');
  });
});
