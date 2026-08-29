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

// Moved to ./debugView.ts in Phase 2: a second spec declaring the same global with a different
// shape is a TS2717 build failure, and two hand-maintained copies of one contract drift.
import type { GameDebugView } from './debugView';
import { dismissTitle } from './gameHarness';
// Fixtures and page-driving helpers extracted to a sibling module when this file crossed 400
// lines — DATA and SETUP only, every `test()`/`expect` verifying a criterion stays here. Not
// named `*.spec.ts` so Playwright's testMatch does not collect it as an empty spec. See
// bootHelpers.ts.
import {
  catalogWith,
  collectConsoleErrors,
  expectCanvasFiltering,
  firstImage,
  REFUSAL_TIMEOUT,
  waitForTerminalState,
} from './bootHelpers';

/**
 * ADDED IN PHASE 3, and recorded in QA-LOG.md as a deliberate regression-set change.
 *
 * Phase 3 made `levels` a REQUIRED catalog field (Codex plan review P3: an optional list is how a
 * typo ships a game with no levels and a boot that is happy about it). Every catalog-injection
 * fixture below therefore has to carry a VALID levels list — otherwise each one would still refuse
 * to route, but for the missing levels list rather than for the defect it was written to test, and
 * six sharp gates would quietly become one blunt one.
 */

function readGame(page: Page): Promise<GameDebugView> {
  return page.evaluate(() => {
    if (!window.__game) {
      throw new Error('window.__game is not installed');
    }
    return window.__game;
  });
}

test.describe('Phase 1 — Boot', () => {
  test('1.4 canvas mounts, boot succeeds, zero console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);
    await dismissTitle(page); // Phase 11: Game is PAUSED under the title until this. See the helper.

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

    // AMENDED IN PHASE 2, and recorded in QA-LOG.md as a deliberate regression-set change.
    // Phase 1 asserted `'Boot'`, `tick === 0` and `player === null` because it deliberately built
    // no destination — this file's own header said "there is no post-Boot scene in Phase 1".
    // Phase 2 built GameScene, so a successful boot now ROUTES, and these three assertions would
    // otherwise fail on a correct game.
    //
    // The refusal-path assertions are untouched (see 1.5 below, still `'Boot'`): refusing to
    // route still means staying in Boot, which is what keeps the Phase 1 gate real.
    expect(game.sceneKey).toBe('Game');
    expect(game.tick).toBeGreaterThan(0);
    expect(game.player).not.toBeNull();
    // `player` is typed `unknown` on purpose, so narrowing it is a type assertion the spec has to
    // make out loud rather than one the compiler makes for it (this file's header, vault C1).
    expect(typeof (game.player as { x?: unknown }).x).toBe('number');
    // AMENDED IN PHASE 3, recorded in QA-LOG.md as a deliberate regression-set change. Phase 1
    // asserted null because nothing wrote this field; Phase 3 loads a Tiled level, so a null here
    // now means the level never loaded — the assertion is stronger, not weaker.
    expect(game.levelId).toBe('level-01');

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
    // The asset is DERIVED from the shipped catalog, never named. It used to be a literal
    // `placeholder-tile`, which the Phase 3/4 art work removed from the catalog entirely — so the
    // interception matched nothing, the boot succeeded, and this gate stopped testing a 404 at all.
    const broken = await firstImage(page);
    await page.route(`**/${broken.url}`, (route) =>
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
    expect(game.bootError).toContain(broken.key);
    expect(game.ready).toBe(false);
    // It refused rather than routing onward.
    expect(game.sceneKey).toBe('Boot');
  });

  test('1.5 a corrupt 200 blocks boot', async ({ page }) => {
    // corrupt-fixture.png is committed HTML, served with a 200 and content-type image/png
    // (measured). This is the silent-fallback case a status-code check alone waves through.
    // `?breakAsset=corrupt` redirects the catalog's FIRST image, so the expected key is read
    // from the catalog rather than restated here.
    const broken = await firstImage(page);
    await page.goto('/?breakAsset=corrupt');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);

    expect(typeof game.bootError).toBe('string');
    // The distinguishing signal: no transport error, so `loaderror` stays silent and the
    // texture verification is what catches it. Asserting the message keeps the two 1.5 cases
    // from collapsing into "something refused".
    expect(game.bootError).toContain(broken.key);
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
    const body = await catalogWith(page, { images: [] });
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body }),
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
    // Built before the route is registered: the fulfil callback is synchronous, and a catalog
    // fetched from inside it would be intercepted by the route it is being used to define.
    const real = await firstImage(page);
    const body = await catalogWith(page, {
      images: [
        { key: 'dup', url: real.url },
        { key: 'dup', url: 'assets/never-fetched.png' },
      ],
    });
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body }),
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
    const real = await firstImage(page);
    const body = await catalogWith(page, { images: [{ key: '__MISSING', url: real.url }] });
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(game.bootError).toContain('reserves');
    expect(game.ready).toBe(false);
  });

  test('1.5 a malformed catalog entry refuses rather than hanging', async ({ page }) => {
    // Built from the real catalog, so this refuses for the MALFORMED ENTRY rather than for the
    // missing sheets list — Codex implementation review, finding 3.
    const malformed = await catalogWith(page, { images: [null] });
    // `entry.key` on a null entry throws inside the filecomplete handler; unhandled, that
    // propagates through the loader, `complete` never fires, create() never runs, and the game
    // sits at ready=false/bootError=null forever. A hang is the one state the QA gate cannot
    // distinguish from a slow boot, so malformed input must become a refusal.
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: malformed }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(typeof game.bootError).toBe('string');
    expect(game.ready).toBe(false);
  });

  test('1.5 the gate still works on a scene RESTART, not just a fresh page', async ({ page }) => {
    // The nastiest hole found in this phase, and the one three reviews took to surface.
    // Phaser's TextureManager and JSON cache are game-global and survive a scene restart, and
    // `LoaderPlugin.addFile` silently skips any key already cached. So on the second entry to
    // Boot nothing is re-fetched, and the gate validates stale cache against stale cache —
    // reporting success no matter what is actually on the server. Phase 2+ returns to Boot,
    // so this is the apparatus all nine later phases inherit.
    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);
    expect((await readGame(page)).ready).toBe(true);

    // Now break the asset and restart the scene WITHOUT reloading the page, so every cache
    // stays warm. A gate that only re-validates cached state would still say ready.
    const broken = await firstImage(page);
    await page.route(`**/${broken.url}`, (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    );

    await page.evaluate(() => {
      const g = (window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } })
        .__phaserGame;
      (g.scene.getScene('Boot') as { scene: { restart(): void } }).scene.restart();
    });

    await page.waitForFunction(() => window.__game?.bootError !== null, undefined, {
      timeout: REFUSAL_TIMEOUT,
    });

    const game = await readGame(page);
    expect(game.ready).toBe(false);
    expect(game.bootError).toContain(broken.key);
  });

  test('1.5 a null LEVEL entry refuses rather than hanging (Codex review 2, finding 2)', async ({
    page,
  }) => {
    // The same hang, one list over. `describeCatalogProblem` rejects a non-object entry, but
    // `create()` still called `verifyLevels`, which checked only `Array.isArray(catalog.levels)`
    // and then dereferenced `entry.key` — and `[null]` IS an array. It threw mid-collection, so
    // `refuseToRoute` never ran and boot sat at ready:false / bootError:null forever.
    //
    // This is the fixture that distinguishes "refused" from "hung": the wait below is on a
    // TERMINAL state, so a hang fails as a timeout rather than passing as a sleep.
    const body = await catalogWith(page, { levels: [null] });
    await page.route('**/assets/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body }),
    );

    await page.goto('/');
    await waitForTerminalState(page, REFUSAL_TIMEOUT);

    const game = await readGame(page);
    expect(typeof game.bootError).toBe('string');
    expect(game.bootError).toContain('asset-catalog');
    expect(game.ready).toBe(false);
    expect(game.sceneKey).toBe('Boot');
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

    // The rule and its evidence live in `src/render/canvasScaling.ts`; the assertion lives in
    // `bootHelpers.ts` so the runtime and the spec share ONE definition (vault 5.3) and this file
    // stays inside the 400-line rule.
    await expectCanvasFiltering(page);
  });
});
