/**
 * The routes OUT of the welcome screen, and the ones that must not exist — Phase 11, 11.7 / 11.9.
 *
 * Split from `phase-11-welcome.spec.ts` when that file crossed the hard 400-line ceiling. The
 * page-side helpers both files use live in `titleHarness.ts`, so a criterion is asserted against one
 * definition rather than two that agree on the happy path.
 */

import { expect, test } from '@playwright/test';
import { storedSettings } from './audioHelpers';
import {
  RUNNING,
  TITLE,
  bootToTitle,
  gameStatus,
  restartGame,
  sceneActive,
} from './titleHarness';
import type { SceneHandle } from './titleHarness';
import { dismissTitle } from './gameHarness';
import './debugView';

test.describe('Phase 11 — 11.7 / 11.9 the routes out of the title, and the ones that must not exist', () => {
  /**
   * 🔴 **ENTER, not L.** The screen shipped with two doors to the same place — ENTER straight into a
   * level, `L` to the menu — and the owner's call on 2026-08-29 was one way in, through the menu.
   * `L` is no longer bound here at all, so a test still pressing it would pass by pressing nothing.
   */
  for (const key of ['Enter', 'Space', 'NumpadEnter']) {
    test(`${key} opens the level menu`, async ({ page }) => {
      await bootToTitle(page);

      await page.keyboard.press(key);

      await page.waitForFunction(
        () =>
          (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive('LevelSelect'),
        undefined,
        { timeout: 5_000 },
      );
      expect(await sceneActive(page, TITLE), 'the title must be gone, not drawn over the menu').toBe(
        false,
      );
      // 🔴 And GAME must be gone too. Checking only that the menu opened would pass if the title had
      // ALSO resumed Game — a live world updating under the level menu, which is the failure mode
      // `openLevelSelect` being Game-owned exists to prevent. Codex implementation review, finding 6.
      expect(await gameStatus(page), 'a running Game under the menu is the defect').not.toBe(RUNNING);
    });
  }

  test('L is not a route any more', async ({ page }) => {
    await bootToTitle(page);

    await page.keyboard.press('l');
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );

    // Not a formality: `L` is still an ATTACK key in `gameInput.ts`, so if the title ever stopped
    // being the thing that swallows it, this press would reach a paused game's listener.
    expect(await sceneActive(page, 'LevelSelect'), 'L must no longer open the menu').toBe(false);
    expect(await sceneActive(page, TITLE), 'and the title stays up').toBe(true);
  });

  /**
   * The DEV half of 11.9. `P` / `O` / `G` are bound only in the dev build and are deliberately NOT
   * gated on `isPlayerInputEnabled`; the pause is the only thing stopping them.
   *
   * 🔴 **The scene each key would open is named and asserted absent.** This first checked only that
   * the title was still up and `__game.sceneKey` still read `'Game'` — and `GymScene` extends
   * `Phaser.Scene` directly and publishes nothing to the debug surface, so a leaked `G` would have
   * left BOTH assertions true while the gym ran underneath. An assertion that cannot see the leak it
   * names is decoration. Codex implementation review round 4, finding 3.
   */
  for (const [key, leaked] of [
    ['p', 'Playground'],
    ['o', 'ElementEditor'],
    ['g', 'Gym'],
  ] as const) {
    test(`DEV key ${key.toUpperCase()} cannot leak past the title`, async ({ page }) => {
      await bootToTitle(page);

      await page.keyboard.press(key);
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );

      expect(await sceneActive(page, leaked), `${leaked} must not have started`).toBe(false);
      expect(await sceneActive(page, TITLE), 'the title is still up').toBe(true);
      expect((await page.evaluate(() => window.__game))?.sceneKey, 'still Game-owned').toBe('Game');
    });
  }

  /**
   * 🔴 **Two dismissing keys in ONE input batch.** Phaser drains its whole key queue in a single
   * `KeyboardPlugin.update()` pass, so `L` and `ENTER` in the same frame both reached `dismiss`. The
   * queue that produced was `[stop Title, stop Game, start LevelSelect, stop Title, resume Game]` —
   * and `Systems.resume()` cannot tell a stopped scene from a paused one, because `shutdown()` sets
   * the same `active = false` flag `pause` does. It would step a torn-down `Game` under the menu.
   * Closed by a `dismissed` latch; found by the criterion 11.14 review reading the engine.
   */
  test('L and ENTER in the same frame do not resurrect the stopped Game', async ({ page }) => {
    await bootToTitle(page);

    await page.evaluate(() => {
      const fire = (code: string): void => {
        for (const type of ['keydown', 'keyup']) {
          window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
        }
      };
      fire('KeyL');
      fire('Enter');
    });

    await page.waitForFunction(
      () => (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive('LevelSelect'),
      undefined,
      { timeout: 5_000 },
    );
    const status = await gameStatus(page);
    expect(typeof status, 'type before value').toBe('number');
    expect(status, 'a resumed Game would be stepped against a dead display list').not.toBe(RUNNING);
  });
});

test.describe('Phase 11 — the audio listener does not survive its own scene', () => {
  /**
   * 🔴 The Game audio listener is now a **raw DOM listener**, not a Phaser `keydown` subscription,
   * because `ANY_KEY_DOWN` is itself gated on `keys[event.keyCode].isDown`. A DOM listener outlives
   * its scene unless the scene removes it — so a restart with a broken teardown leaves TWO live
   * listeners and one press steps the volume **twice**.
   *
   * Nothing tested that. Codex implementation review, finding 6: "none of the new tests deletes the
   * SHUTDOWN cleanup, restarts Game, then presses an audio key."
   */
  test('one press after a Game restart is still exactly one step', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      ['steampunk.audio', JSON.stringify({ muted: false, volume: 0.5 })] as const,
    );
    await bootToTitle(page);
    await dismissTitle(page);

    await restartGame(page);
    await page.waitForFunction(() => (window.__game?.tick ?? 0) > 0, undefined, { timeout: 15_000 });

    await page.keyboard.press('BracketLeft');

    // 0.4 is one step. 0.3 would be two listeners, which is the defect.
    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.4);
  });

  /**
   * The title's own listener needs the IME guard too, and it is NOT covered by the game-side test:
   * `TitleScene` registers no keys, so `keys[229]` is undefined and Phaser's `ANY_KEY_DOWN` accepts
   * a composition keydown here that the game listener's own guard would never see. Codex
   * implementation review, finding 3.
   */
  test('an IME composition keystroke does not move the volume ON THE TITLE', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      ['steampunk.audio', JSON.stringify({ muted: false, volume: 0.5 })] as const,
    );
    await bootToTitle(page);

    await page.evaluate(() => {
      const make = (type: string): KeyboardEvent =>
        new KeyboardEvent(type, { code: 'BracketLeft', keyCode: 229, isComposing: true, bubbles: true });
      window.dispatchEvent(make('keydown'));
      window.dispatchEvent(make('keyup'));
    });
    // A real press after it, so this cannot pass by the whole path being dead.
    await page.keyboard.press('BracketLeft');

    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.4);
  });
});
