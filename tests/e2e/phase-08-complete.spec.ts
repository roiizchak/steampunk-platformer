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

import { expect, test, type Page } from '@playwright/test';

import { BOOT_TIMEOUT, bootToGame } from './gameHarness';
import { assertRealGpu } from './realGpu';
import { shippedLevel } from './tilemapHelpers';

const PROGRESS_KEY = 'steampunk.progress';

interface DrawnGoal {
  x: number;
  y: number;
  alpha: number;
  depth: number;
  willRender: boolean;
}

/** The exit, read off the live scene through `__phaserGame` — the `drawnVsSim.ts` pattern. */
async function drawnGoal(page: Page): Promise<DrawnGoal | null> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      goalObject?: {
        x: number;
        y: number;
        alpha: number;
        depth: number;
        willRender(camera: unknown): boolean;
      };
      cameras: { main: unknown };
    };
    const g = scene.goalObject;
    if (!g) return null;
    return { x: g.x, y: g.y, alpha: g.alpha, depth: g.depth, willRender: g.willRender(scene.cameras.main) };
  });
}

interface DrawnOverlay {
  present: boolean;
  fadeAlpha: number;
  fadeRenders: boolean;
  lines: { text: string; alpha: number; renders: boolean }[];
}

/** The level-complete panel, read off the parallel `UIScene`. */
async function drawnOverlay(page: Page): Promise<DrawnOverlay> {
  return page.evaluate(() => {
    const ui = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('UI') as {
      overlay?: {
        fade: { alpha: number; willRender(c: unknown): boolean };
        lines: { text: string; alpha: number; willRender(c: unknown): boolean }[];
      };
      cameras: { main: unknown };
    };
    if (!ui?.overlay) return { present: false, fadeAlpha: 0, fadeRenders: false, lines: [] };
    const cam = ui.cameras.main;
    return {
      present: true,
      fadeAlpha: ui.overlay.fade.alpha,
      fadeRenders: ui.overlay.fade.willRender(cam),
      lines: ui.overlay.lines.map((l) => ({ text: l.text, alpha: l.alpha, renders: l.willRender(cam) })),
    };
  });
}

/**
 * Play level-01 to its exit, driving the game with REAL key events.
 *
 * ## Why the jumps are dispatched from inside the page
 *
 * The first version held ArrowRight from Playwright and pressed Space on a loop with `waitTicks`
 * between presses. Every press and every wait is a round trip, so 200 of them cost ~40 s of pure
 * latency before the level had a chance to finish, and the presses were not aimed at anything — the
 * run timed out at 60 s having fallen into the same gap repeatedly.
 *
 * This installs a `requestAnimationFrame` loop in the page that dispatches genuine `KeyboardEvent`s on
 * `window`, which is where Phaser's keyboard plugin listens. It is the same policy the unit-level
 * auto-player uses (`level-completable.test.ts`): hold Right, jump when blocked or when the ground
 * ahead runs out. **It is not a teleport** — every hazard, every enemy and the whole route are still in
 * the way, which is what makes "the level was finished" mean anything.
 *
 * ⚠️ A wait expressed in ticks cannot bound this window, so nothing here sleeps: the loop runs in the
 * page and Playwright waits on the terminal CONDITION.
 */
const RUN_TIMEOUT = 90_000;

async function playToExit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __drive?: number;
    };
    /**
     * 🔴 `keyCode` has to be forced on. Phaser's keyboard plugin dispatches on `event.keyCode`, which is
     * deprecated and therefore NOT settable through `KeyboardEventInit` — a synthetic event carries 0,
     * every key resolves to nothing, and the game simply never moves. The first version of this driver
     * looked correct and timed out at 90 s with the player standing on the spawn.
     */
    const CODES: Record<string, number> = { ArrowRight: 39, Space: 32 };
    const key = (type: 'keydown' | 'keyup', code: string) => {
      const event = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true });
      Object.defineProperty(event, 'keyCode', { get: () => CODES[code] });
      window.dispatchEvent(event);
    };

    key('keydown', 'ArrowRight');
    let lastX = -1;
    let stuck = 0;
    /**
     * 🔴 Space must be HELD, not tapped. `sampleHeldKeys` reads `jumpHeld` from `key.isDown` every
     * frame, and releasing in the same frame as the press is the jump CUT — the player got a hop a
     * fraction of the full arc. 45 frames is past the apex — the second attempt held it for 20, which is
     * still a cut, and the player stood at x 3198 jumping into the face of the 3-tile wall 38 times
     * without clearing it. Holding longer than the arc costs nothing; holding too little is invisible
     * except as a level that cannot be finished.
     */
    let releaseIn = 0;

    const step = () => {
      const scene = w.__phaserGame.scene.getScene('Game') as {
        simWorld?: { player: { x: number; y: number; vy: number }; solids: { x: number; y: number; w: number; h: number }[]; completed: boolean };
      };
      const world = scene?.simWorld;
      if (!world || world.completed) return;
      if (releaseIn > 0 && --releaseIn === 0) key('keyup', 'Space');
      const { player } = world;
      if (player.vy === 0 && releaseIn === 0) {
        const lead = player.x + 66;
        stuck = Math.abs(player.x - lastX) < 0.5 ? stuck + 1 : 0;
        const ground = world.solids.some(
          (s) => s.x <= lead + 16 && s.x + s.w >= lead + 16 && s.y >= player.y - 8 && s.y <= player.y + 600,
        );
        if (stuck >= 4 || !ground) {
          key('keydown', 'Space');
          releaseIn = 45;
          stuck = 0;
        }
      }
      lastX = player.x;
      w.__drive = requestAnimationFrame(step);
    };
    w.__drive = requestAnimationFrame(step);
  });

  try {
    await page.waitForFunction(
      () => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as { simWorld?: { completed: boolean } };
        return Boolean(scene?.simWorld?.completed);
      },
      undefined,
      { timeout: RUN_TIMEOUT, polling: 100 },
    );
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as { __drive?: number };
      if (w.__drive !== undefined) cancelAnimationFrame(w.__drive);
      const up = new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true });
      Object.defineProperty(up, 'keyCode', { get: () => 39 });
      window.dispatchEvent(up);
    });
  }
}

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
