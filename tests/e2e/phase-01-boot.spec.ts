import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 QA criteria 1.4, 1.5 and 1.6.
 *
 * The whole file turns on one idea, from Codex plan-review finding F1: a successful boot, a
 * refused boot and an infinite hang must be distinguishable FROM EACH OTHER, from the same
 * build. There is no post-Boot scene in Phase 1, so `sceneKey === 'Boot'` is true in all three
 * states and proves nothing on its own.
 *
 *   unmodified          -> ready === true,  bootError === null
 *   ?breakAsset / Filter -> ready === false, bootError is a non-empty string
 *   hung                -> ready === false, bootError === null  -> these waits time out
 *
 * Vault C1: a prior project shipped a regression test that passed vacuously on
 * `undefined === undefined` through a debug hook that returned nothing. Every read below
 * therefore asserts the TYPE before the value.
 */

interface GameDebugView {
  sceneKey: string;
  tick: number;
  player: unknown;
  score: number;
  health: number;
  levelId: string | null;
  ready: boolean;
  bootError: string | null;
}

declare global {
  interface Window {
    __game?: GameDebugView;
  }
}

/**
 * `loader.maxRetries` is 2 in Phaser 4, so a 404 is attempted THREE times before `loaderror`
 * fires. Sized for that: too tight and a correct refusal fails as a timeout, which reads as
 * a hang and sends you debugging the wrong thing.
 */
const REFUSAL_TIMEOUT = 20_000;

function readGame(page: Page): Promise<GameDebugView> {
  return page.evaluate(() => {
    if (!window.__game) {
      throw new Error('window.__game is not installed');
    }
    return window.__game;
  });
}

async function waitForTerminalState(page: Page, timeout: number): Promise<void> {
  // Waits on a CONDITION, never a fixed sleep. A sleep long enough to pass here would also be
  // long enough to hide the hang that F1 describes.
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout },
  );
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test.describe('Phase 1 — Boot', () => {
  test('1.4 canvas mounts, boot succeeds, zero console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible();

    // The canvas backing store is the base resolution, regardless of CSS scaling.
    const size = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    expect(size).toEqual({ width: 1920, height: 1080 });

    const game = await readGame(page);

    // Types before values (vault C1) — `undefined === undefined` must not be able to pass.
    expect(typeof game.sceneKey).toBe('string');
    expect(typeof game.tick).toBe('number');
    expect(typeof game.score).toBe('number');
    expect(typeof game.health).toBe('number');
    expect(typeof game.ready).toBe('boolean');

    expect(game.sceneKey).toBe('Boot');
    expect(game.tick).toBe(0);
    expect(game.player).toBeNull();
    expect(game.levelId).toBeNull();

    // The positive terminal state. This is the assertion that separates success from a hang.
    expect(game.ready).toBe(true);
    expect(game.bootError).toBeNull();

    expect(errors).toEqual([]);
  });

  test('1.4 window.__game is live and read-only, not a stale snapshot', async ({ page }) => {
    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const result = await page.evaluate(() => {
      const before = window.__game!.ready;
      // Attempting to write must not take effect: the property is a getter with no setter,
      // and each read returns a frozen copy.
      try {
        (window.__game as unknown as { ready: boolean }).ready = false;
      } catch {
        /* strict-mode TypeError is also an acceptable outcome */
      }
      return { before, after: window.__game!.ready };
    });

    expect(result.before).toBe(true);
    expect(result.after).toBe(true);
  });

  test('1.5 a genuine 404 on a texture blocks boot', async ({ page }) => {
    // The route interception is NOT belt-and-braces — it is the only way to test this.
    //
    // Vite's dev server answers a missing file with HTTP 200 and the SPA fallback HTML, never
    // a 404 (measured: GET /assets/does-not-exist.png -> 200 text/html). Pointing the loader
    // at a nonexistent path therefore exercises the corrupt-200 path, not the 404 path, and
    // the two would silently collapse into one test that claims to be two.
    await page.route('**/assets/placeholder-tile.png', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).not.toBe('');
    expect(game.ready).toBe(false);
    // It refused rather than routing onward.
    expect(game.sceneKey).toBe('Boot');
  });

  test('1.5 a corrupt 200 blocks boot', async ({ page }) => {
    // corrupt-fixture.png is committed HTML, served with a 200 and content-type image/png
    // (measured). This is the silent-fallback case a status-code check alone waves through.
    await page.goto('/?breakAsset=corrupt');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).not.toBe('');
    expect(game.ready).toBe(false);
  });


  test('1.5 a missing asset catalog blocks boot via the loaderror path', async ({ page }) => {
    // The catalog is JSON over XHR, which fails at the LOAD stage and so does fire `loaderror`.
    // Images fail at the PROCESS stage, which fires nothing at all in Phaser 4.2.1. This case
    // is what keeps the `loaderror` listener honest — without it, that listener would be dead
    // code carrying a comment claiming otherwise (vault C9).
    await page.goto('/?breakAsset=catalog');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).toContain('asset-catalog');
    expect(game.ready).toBe(false);
  });

  test('1.6 a CSS override of the pinned filtering blocks boot', async ({ page }) => {
    // Reproduces the vault's recorded failure: a CSS property silently contradicting the
    // engine-side filtering decision. Proves the runtime assertion actually runs rather than
    // being reviewed and never executed.
    await page.goto('/?breakFilter=1');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).toContain('filtering not pinned');
    expect(game.ready).toBe(false);
  });

  test('1.6 filtering is pinned to nearest-neighbour on a clean boot', async ({ page }) => {
    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const render = await page
      .locator('#game canvas')
      .evaluate((el) => getComputedStyle(el).imageRendering);

    // Phaser's setCrisp() tries a list of values and the browser keeps the last it recognises,
    // so the winning string is engine-dependent. Chromium lands on 'pixelated'.
    expect(['pixelated', 'crisp-edges', 'optimize-contrast', '-webkit-optimize-contrast']).toContain(
      render,
    );
  });
});
