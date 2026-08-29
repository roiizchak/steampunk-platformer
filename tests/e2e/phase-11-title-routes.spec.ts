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
import { BOOT_TIMEOUT, dismissTitle } from './gameHarness';
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
   * Two dismissal keys in ONE input batch. Phaser drains its whole key queue in a single
   * `KeyboardPlugin.update()` pass, so both reach `dismiss` before a frame is drawn, and the
   * end state must still be the menu over a stopped `Game`.
   *
   * ⚠️ **This is NOT a gate on the `dismissed` latch, and it used to claim it was.** Two things
   * were wrong with that claim and only the first was Codex's finding 4: it fired `L` and `ENTER`,
   * and `L` stopped dismissing anything when the owner made the menu the only way in — one live key
   * and one dead one. Fixing that to `SPACE` + `ENTER` was not enough. **Deleting the latch leaves
   * this green too**, watched on 2026-08-29: `dismiss` twice is `scene.stop()` on an
   * already-stopping `Title` and `scene.start('LevelSelect')` twice, which restarts the menu to the
   * same state. The sequence the latch was written against — `[stop Title, stop Game, start
   * LevelSelect, stop Title, resume Game]`, resurrecting a torn-down `Game` — **needed `onPlay`**,
   * and `onPlay` is gone.
   *
   * So the latch stays as defence and this test keeps the claim it can actually prove. A gate that
   * cannot go red for the defect it names is decoration, and the fix for one is not to keep the name.
   * Recorded in `docs/qa/phase-11-welcome.md`.
   */
  test('two dismissal keys in one batch still land in the menu, not in a running Game', async ({
    page,
  }) => {
    await bootToTitle(page);

    await page.evaluate(() => {
      const fire = (code: string): void => {
        for (const type of ['keydown', 'keyup']) {
          window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
        }
      };
      fire('Space');
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

  /**
   * 🔴 **The whole player route, walked, with a save that makes the answer non-trivial.**
   *
   * `gameHarness.dismissTitle` SKIPS this screen through `__phaserGame` — deliberately, for the
   * reasons in its docstring — so all ~40 specs that boot through it observe the `Game` the BOOT
   * created and resumed, never the one the MENU starts. Nothing else covered the difference.
   *
   * The concrete hole that leaves, named by the Codex implementation review of the redesign
   * (finding 2): `LevelSelectScene.play()` could start `level-01` unconditionally. The saved-level
   * specs would pass — they never reach the menu. Production would pass — it runs a fresh profile,
   * where the furthest unlocked level IS level-01. Only a returning player would notice, and only
   * by being dropped into the wrong level.
   *
   * So this seeds two completed levels, reads the row the menu actually HIGHLIGHTED, and asserts the
   * level that loads is that one. It compares the menu against itself rather than against this
   * spec's model of the unlock rule, so it cannot rot into a second, disagreeing copy of it.
   */
  test('the real route — title, menu, the level the menu highlighted', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [
        'steampunk.progress',
        '{"version":1,"lastLevel":"level-01","levels":{' +
          '"level-01":{"completed":true,"bestGears":4},' +
          '"level-02":{"completed":true,"bestGears":2}}}',
      ] as const,
    );
    await bootToTitle(page);

    // Boot resolved the SAVED level; the menu will open on the furthest UNLOCKED one. They differ
    // here on purpose — otherwise a menu that ignored its cursor would still look right.
    const booted = (await page.evaluate(() => window.__game))?.levelId;
    expect(typeof booted, 'type before value').toBe('string');

    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive('LevelSelect'),
      undefined,
      { timeout: 5_000 },
    );

    /**
     * 🔴 **The row the menu DREW as selected, not the one its cursor points at.**
     *
     * Reading `rows[cursor]` catches `play()` ignoring the cursor — and nothing else. `paint()`
     * could put the `>` marker and the selected colour on a different row entirely, and a test that
     * called the cursor row "highlighted" would agree with itself and pass while the player watched
     * one row light up and another load. Codex implementation review of the redesign, round 2,
     * finding 2. The marker is the player-visible fact, so the marker is what is read.
     */
    const highlighted = await page.evaluate(() => {
      const scene = (window as unknown as {
        __phaserGame: { scene: { getScene(k: string): unknown } };
      }).__phaserGame.scene.getScene('LevelSelect') as {
        rows: { id: string; unlocked: boolean; text: { text: string } }[];
      };
      const marked = scene.rows.filter((row) => row.text.text.startsWith('> '));
      return {
        marked: marked.length,
        id: marked[0]?.id,
        unlocked: marked[0]?.unlocked,
      };
    });
    expect(highlighted.marked, 'exactly one row may be drawn selected').toBe(1);
    expect(typeof highlighted?.id, 'the menu drew no highlighted row').toBe('string');
    expect(highlighted?.unlocked, 'the menu opened on a LOCKED row').toBe(true);
    expect(highlighted?.id, 'a fresh-profile menu would not exercise the cursor at all').not.toBe(
      booted,
    );

    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (id) => window.__game?.levelId === id && (window.__game?.tick ?? 0) > 0,
      highlighted?.id,
      { timeout: BOOT_TIMEOUT },
    );

    const view = await page.evaluate(() => window.__game);
    expect(view?.sceneKey, 'the menu must hand the world back to Game').toBe('Game');
    expect(view?.levelId, 'the menu started a level other than the one it highlighted').toBe(
      highlighted?.id,
    );
    expect(await sceneActive(page, 'LevelSelect'), 'the menu must be gone').toBe(false);
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
    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.35);
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

    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.35);
  });
});
