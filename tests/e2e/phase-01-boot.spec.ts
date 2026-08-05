import { expect, test, type Page } from '@playwright/test';
import { CRISP_IMAGE_RENDERING } from '../../src/game/constants';

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

  test('1.4 window.__game is LIVE — a value read before boot updates after it', async ({ page }) => {
    // Reading `ready` twice after boot proves nothing: a once-assigned stale snapshot returns
    // `true` both times. Liveness only shows up across a state CHANGE, so this captures the
    // value before boot finishes and compares it with the value after.
    await page.goto('/', { waitUntil: 'commit' });

    const early = await page.evaluate(() => {
      // May be undefined if the bundle has not run yet; that is a distinct, acceptable state.
      return window.__game ? window.__game.ready : null;
    });

    await waitForTerminalState(page, REFUSAL_TIMEOUT);
    const late = await readGame(page);

    expect(late.ready).toBe(true);
    // Either the seam was not installed yet (null), or it was installed and reported not-ready.
    // What must NOT happen is an early read of `true`, which would mean the value never moved.
    expect(early).not.toBe(true);
  });

  test('1.4 window.__game is read-only — neither writable nor redefinable', async ({ page }) => {
    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const result = await page.evaluate(() => {
      const before = window.__game!.ready;

      // 1. Writing a field on the returned object: it is frozen, so this must not stick.
      try {
        (window.__game as unknown as { ready: boolean }).ready = false;
      } catch {
        /* a strict-mode TypeError is an equally acceptable outcome */
      }
      const afterFieldWrite = window.__game!.ready;

      // 2. Assigning the whole property: the descriptor has a getter and no setter.
      try {
        (window as unknown as { __game: unknown }).__game = { ready: false, bootError: 'faked' };
      } catch {
        /* likewise */
      }
      const afterAssign = window.__game!.ready;

      // 3. Redefining the property: this is what `configurable: false` exists to stop, and it
      //    is the one route that would let a test replace the QA oracle wholesale.
      let redefineThrew = false;
      try {
        Object.defineProperty(window, '__game', { value: { ready: false, bootError: null } });
      } catch {
        redefineThrew = true;
      }
      const afterRedefine = window.__game!.ready;

      return { before, afterFieldWrite, afterAssign, afterRedefine, redefineThrew };
    });

    expect(result.before).toBe(true);
    expect(result.afterFieldWrite).toBe(true);
    expect(result.afterAssign).toBe(true);
    expect(result.afterRedefine).toBe(true);
    expect(result.redefineThrew).toBe(true);
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
    // Asserts the SPECIFIC signal, not merely "some refusal happened". Without this the test
    // stays green when an unrelated refusal (a filtering regression, a malformed catalog)
    // fires instead, while still claiming the 404 path is covered.
    expect(game.bootError).toContain('load error');
    expect(game.bootError).toContain('placeholder-tile');
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
    // The distinguishing signal: no transport error, so `loaderror` stays silent and the
    // texture verification is what catches it. Asserting the message keeps the two 1.5 cases
    // from collapsing into "something refused".
    expect(game.bootError).toContain('placeholder-tile');
    expect(game.bootError).toContain('not registered');
    expect(game.bootError).not.toContain('load error');
    expect(game.ready).toBe(false);
  });

  test('1.5 a missing asset catalog blocks boot', async ({ page }) => {
    // Note this does NOT exercise `loaderror`: Vite answers the missing .json with 200 + HTML,
    // so the XHR succeeds and JSON.parse fails at the process stage — silently, exactly like an
    // image. The catalog shape check in create() is what refuses. Measured; an earlier version
    // of this test was named for the loaderror path and asserted a mechanism that never ran.
    await page.goto('/?breakAsset=catalog');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).toContain('asset-catalog');
    expect(game.bootError).toContain('missing or malformed');
    expect(game.ready).toBe(false);
  });

  test('1.5 zero expected assets is not mistaken for zero failures', async ({ page }) => {
    // An empty expectation satisfies itself trivially. This is the shape of the real defect
    // found during Phase 1: a catalog that failed to load queued nothing, so nothing failed,
    // so boot succeeded with no assets at all.
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"images":[]}' }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(game.bootError).toContain('lists no images');
    expect(game.ready).toBe(false);
  });

  test('1.5 a duplicate catalog key blocks boot', async ({ page }) => {
    // Phaser's addFile silently skips a key that already exists, so the second entry is never
    // fetched while an existence check passes for both.
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: [
            { key: 'dup', url: 'assets/placeholder-tile.png' },
            { key: 'dup', url: 'assets/never-fetched.png' },
          ],
        }),
      }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(game.bootError).toContain('duplicate key');
    expect(game.ready).toBe(false);
  });

  test('1.5 a Phaser-reserved texture key blocks boot', async ({ page }) => {
    // __DEFAULT/__MISSING/__WHITE/__NORMAL are real 32x32 textures registered at boot. A
    // catalog entry using one would never be fetched, yet would pass both existence and
    // non-zero-dimension checks — a clean boot with the asset entirely absent.
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ images: [{ key: '__MISSING', url: 'assets/placeholder-tile.png' }] }),
      }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(game.bootError).toContain('reserves');
    expect(game.ready).toBe(false);
  });

  test('1.5 a malformed catalog entry refuses rather than hanging', async ({ page }) => {
    // `entry.key` on a null entry throws inside the filecomplete handler; unhandled, that
    // propagates through the loader, `complete` never fires, create() never runs, and the game
    // sits at ready=false/bootError=null forever. A hang is the one state the QA gate cannot
    // distinguish from a slow boot, so malformed input must become a refusal.
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"images":[null]}' }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(typeof game.bootError).toBe('string');
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
    // so the winning string is engine-dependent (Chromium: 'pixelated'; Firefox:
    // '-moz-crisp-edges'). The list is IMPORTED, not retyped: a second hand-maintained copy
    // here previously omitted '-moz-crisp-edges' and 'optimizeSpeed', which would have been a
    // false red on Firefox the day a second browser project was added.
    expect([...CRISP_IMAGE_RENDERING]).toContain(render);
  });
});
