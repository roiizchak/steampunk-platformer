/**
 * The welcome screen — Phase 11, criteria 11.6 / 11.8 / 11.9 / 11.10 / 11.13.
 *
 * These specs deliberately do NOT use `bootToGame`, because it dismisses the title. They boot by
 * hand and then measure the screen the player actually lands on.
 */

import { expect, test } from '@playwright/test';
import { BOOT_TIMEOUT, dismissTitle } from './gameHarness';
import { storedSettings } from './audioHelpers';
import './debugView';

type Page = import('@playwright/test').Page;
type SceneHandle = { scene: { isActive(key: string): boolean; getScene(key: string): unknown } };

/** Phaser scene status constants: PAUSED sits one above RUNNING. */
const RUNNING = 5;
const PAUSED = 6;

/**
 * ⚠️ There is deliberately no Node-side `handle()` helper. A function declared in the spec module
 * does not exist inside `page.evaluate` — the body is serialised and run in the browser — so every
 * reach for `__phaserGame` is written inline, in the page, the way `audioHelpers.ts` does it.
 */
const TITLE = 'Title';

/** Boot and stop at the welcome screen, without dismissing it. */
async function bootToTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout: BOOT_TIMEOUT },
  );
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as { __phaserGame?: SceneHandle }).__phaserGame?.scene.isActive('Title'),
      ),
    undefined,
    { timeout: BOOT_TIMEOUT },
  );
  await page.locator('canvas').click();
}

/** Is `key` an active scene? The cast lives INSIDE the evaluate, which is where it must run. */
function sceneActive(page: Page, key: string): Promise<boolean> {
  return page.evaluate(
    (k) => (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive(k as string),
    key,
  );
}

function gameStatus(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const scene = (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.getScene(
      'Game',
    ) as { sys?: { settings?: { status?: number } } } | undefined;
    return scene?.sys?.settings?.status;
  });
}

/** Sample the tick across N animation frames INSIDE the page and return the aggregate. */
function tickOverFrames(page: Page, frames: number): Promise<{ first: number; last: number; max: number }> {
  return page.evaluate(
    (n) =>
      new Promise<{ first: number; last: number; max: number }>((resolve) => {
        const first = window.__game?.tick ?? -1;
        let max = first;
        let seen = 0;
        const step = (): void => {
          const t = window.__game?.tick ?? -1;
          if (t > max) max = t;
          seen += 1;
          if (seen >= (n as number)) {
            resolve({ first, last: t, max });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

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
    await page.evaluate(() => {
      const scene = (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.getScene(
        'Game',
      ) as { scene: { restart(): void } };
      scene.scene.restart();
    });
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

    await page.evaluate(() => {
      const scene = (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.getScene(
        'Game',
      ) as { scene: { restart(): void } };
      scene.scene.restart();
    });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: BOOT_TIMEOUT });

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
