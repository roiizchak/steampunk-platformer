/**
 * The welcome screen — Phase 11, criteria 11.5 / 11.6 / 11.8 / 11.10 / 11.13.
 *
 * These specs deliberately do NOT use `bootToGame`, because it dismisses the title. They boot by
 * hand and then measure the screen the player actually lands on.
 *
 * The routes OUT of the title live in `phase-11-title-routes.spec.ts`; the page-side helpers both
 * files share live in `titleHarness.ts`.
 */

import { expect, test } from '@playwright/test';
import { BOOT_TIMEOUT, dismissTitle } from './gameHarness';
import { storedSettings } from './audioHelpers';
import {
  PAUSED,
  RUNNING,
  TITLE,
  bootToTitle,
  fireKey,
  restartGame,
  gameStatus,
  sceneActive,
  tickOverFrames,
} from './titleHarness';
import type { SceneHandle } from './titleHarness';
import './debugView';


test.describe('Phase 11 — 11.13 the overlay does not move the boot contract', () => {
  test('the debug surface still reports a ready Game', async ({ page }) => {
    await bootToTitle(page);

    const view = await page.evaluate(() => window.__game);
    // The whole reason this screen is an overlay rather than a route. `LevelSelectScene` publishes
    // because it REPLACES Game; this does not replace anything, so it stays silent like `UIScene`.
    expect(view?.sceneKey, 'the world is still Game-owned').toBe('Game');
    expect(view?.ready, 'ready is the boot terminal condition and the boot really did finish').toBe(true);
    expect(view?.bootError).toBeNull();
  });

  test('the debug surface is still closed at its eight fields', async ({ page }) => {
    await bootToTitle(page);

    const keys = await page.evaluate(() => Object.keys(window.__game ?? {}).sort());
    expect(keys).toEqual(
      ['bootError', 'health', 'levelId', 'player', 'ready', 'score', 'sceneKey', 'tick'].sort(),
    );
  });
});

test.describe('Phase 11 — 11.8 the simulation does not advance under the title', () => {
  /**
   * 🔴 Sampled across frames INSIDE the page, never two synchronous reads.
   *
   * Two reads a moment apart prove nothing about what happened between them, and `waitTicks` can
   * never complete against a paused scene — it would hang rather than fail. Codex plan review
   * round 2, finding 5. Red-proved by removing the `pause()` in `gameTitle.ts`.
   */
  test('the tick is frozen while the welcome screen is up', async ({ page }) => {
    await bootToTitle(page);

    expect(await gameStatus(page), 'Game must be PAUSED, not merely input-disabled').toBe(PAUSED);

    const sample = await tickOverFrames(page, 40);
    expect(sample.first, 'the debug surface must be readable').toBeGreaterThanOrEqual(0);
    expect(sample.max, 'no tick may be drained while the player is reading the title').toBe(sample.first);
  });

  test('the tick advances once the title is dismissed', async ({ page }) => {
    await bootToTitle(page);
    await dismissTitle(page);

    expect(await gameStatus(page)).toBe(RUNNING);
    const sample = await tickOverFrames(page, 40);
    expect(sample.last, 'the simulation must resume').toBeGreaterThan(sample.first);
  });
});

test.describe('Phase 11 — 11.9 keys cannot leak past the title', () => {
  /**
   * ESC is deliberately NOT gated on `isPlayerInputEnabled` (`gameInput.ts`), so before the pause it
   * would stop Game and open the level menu with the title still drawn over it. A paused scene's
   * KeyboardPlugin stops processing entirely, which is what closes this.
   */
  test('ESC does not open the level menu from the welcome screen', async ({ page }) => {
    await bootToTitle(page);

    await page.keyboard.press('Escape');
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );

    expect(await sceneActive(page, TITLE), 'the title is still up').toBe(true);
    expect(await sceneActive(page, 'LevelSelect'), 'ESC must not have opened the menu').toBe(false);
    expect((await page.evaluate(() => window.__game))?.sceneKey).toBe('Game');
  });

  test('SPACE does not latch a jump on the press that dismisses the title', async ({ page }) => {
    await bootToTitle(page);
    const before = await page.evaluate(() => window.__game?.player as { y: number } | null);

    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => !(window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive('Title'),
      undefined,
      { timeout: 5_000 },
    );
    const sample = await tickOverFrames(page, 12);

    const after = await page.evaluate(() => window.__game?.player as { y: number; vy: number } | null);
    expect(typeof after?.y, 'type before value (vault C1)').toBe('number');
    expect(sample.last, 'the game resumed').toBeGreaterThan(sample.first);
    // A latched jump would show as upward velocity in the first frames after the resume.
    expect(after?.y, 'the dismissing press must not also be a jump').toBeGreaterThanOrEqual(
      (before?.y ?? 0) - 1,
    );
  });
});

test.describe('Phase 11 — 11.6 the audio keys answer on the welcome screen', () => {
  /**
   * `Game` is paused, so ITS audio listener is inert. The title carries its own, routed through the
   * same shared map — otherwise the first screen the player sees would have advertised mute and
   * volume keys that do nothing, in the phase that exists to repair them.
   */
  test('volume down works while the title is up', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      ['steampunk.audio', JSON.stringify({ muted: false, volume: 0.5 })] as const,
    );
    await bootToTitle(page);

    await page.keyboard.press('BracketLeft');
    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.4);
  });

  test('mute works while the title is up', async ({ page }) => {
    await bootToTitle(page);

    await page.keyboard.press('m');
    await expect.poll(async () => (await storedSettings(page))?.muted, { timeout: 5_000 }).toBe(true);
  });
});

test.describe('Phase 11 — 11.10 the title shows once per page load', () => {
  test('a Game restart does not reopen it', async ({ page }) => {
    await bootToTitle(page);
    await dismissTitle(page);

    // The shape `phase-07-audio-adopt.spec.ts` and the lifecycle suite use: restart Game directly,
    // with no data. The old `levelId === null` cold-entry test reopened the title on every one.
    await restartGame(page);
    // The restart is proven done by 's SHUTDOWN barrier; this only waits for the NEW
    // world to start stepping, which a re-opened (and therefore pausing) title would prevent.
    await page.waitForFunction(() => (window.__game?.tick ?? 0) > 0, undefined, { timeout: BOOT_TIMEOUT });

    expect(await sceneActive(page, TITLE)).toBe(false);
    expect(await gameStatus(page), 'the restarted Game must be running, not paused').toBe(RUNNING);
  });

  /**
   * 🔴 The case that would otherwise regress the pause invariant silently: restart Game while the
   * title is STILL UP. A latch that merely suppressed relaunching would leave the old title drawn
   * over a newly RUNNING game — a player reading a title screen over a level quietly killing them.
   * Codex plan review round 3, finding 5.
   */
  test('a restart WHILE the title is up re-pauses the new Game', async ({ page }) => {
    await bootToTitle(page);

    await restartGame(page);

    expect(await sceneActive(page, TITLE)).toBe(true);
    expect(await gameStatus(page), 'a title over a running game is the defect').toBe(PAUSED);
  });

  test('a reload does show it again', async ({ page }) => {
    await bootToTitle(page);
    await dismissTitle(page);

    await bootToTitle(page);
    expect(await sceneActive(page, TITLE)).toBe(true);
  });
});

test.describe('Phase 11 — 11.5 the title has its own repeat guard, and it is not the same one', () => {
  /**
   * 🔴 `gameInput.ts` and `TitleScene` each carry their OWN `event.repeat` guard, because the shared
   * `audioKeyMap` maps codes to actions and does not — cannot — share a guard. Every test in
   * `phase-11-audio-keys.spec.ts` runs after `bootToGame`, which dismisses the title, so all six
   * exercise the GAME listener. Deleting the title's guard left the entire suite green. Found by the
   * criterion 11.14 review; this is the missing half.
   */
  test('an auto-repeat on the title does not move the volume', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      ['steampunk.audio', JSON.stringify({ muted: false, volume: 0.5 })] as const,
    );
    await bootToTitle(page);

    await fireKey(page, 'BracketLeft', true);
    await fireKey(page, 'BracketLeft', true);
    // Then a real press, so the assertion cannot pass by nothing working at all.
    await fireKey(page, 'BracketLeft', false);

    await expect.poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 }).toBe(0.4);
  });
});
