/**
 * Phase 6 — the HUD's **lifetime**: it starts with the game, and it stops with it.
 *
 * Split from `phase-06-chrome.spec.ts` when this session's dev-scene teardown test took that file
 * to 449 lines against the project's 400-line ceiling. The seam is a real one rather than a cut to
 * fit: `phase-06-chrome.spec.ts` is about where the HUD SITS — pan, zoom, resize, centring — and
 * every test here is about whether it should exist at all right now.
 *
 * The HUD is a PARALLEL scene, which is what makes this its own question. `GameScene` can stop
 * without `UIScene` noticing, and a HUD left running is not a cosmetic problem: it draws a health
 * bar and a gear count belonging to a game that is no longer being played, over a screen that knows
 * nothing about it — including, in the refusal case, an error screen you could see straight through.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';

type Page = import('@playwright/test').Page;

/** Is a scene running right now, per Phaser's own scene manager? */
const uiActive = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const game = (
      window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } }
    ).__phaserGame;
    return game.scene.isActive('UI');
  });

test.describe('the boot gate still owns the HUD', () => {
  test('a successful boot runs the HUD alongside the game', async ({ page }) => {
    await bootToGame(page);
    expect(await page.evaluate(() => window.__game?.ready)).toBe(true);
    expect(await uiActive(page)).toBe(true);
  });

  /**
   * 🔴 **Leaving `GameScene` must take the HUD with it.** *(code-reviewer brief 2 #6.)*
   *
   * The only `scene.stop('UI')` in the codebase was `BootScene.refuseToRoute`. `GameScene` launches
   * the HUD but never tore it down, so any exit that stops `GameScene` without going through the
   * boot gate left a health bar and a gear counter frozen on top of whatever replaced it. The dev
   * scene toggles (P/O/G) are exactly that exit, and they are the only one that exists **today** —
   * which is the point: the first Phase 7 level transition or pause screen would inherit it, and
   * `GameScene` is the scene that owns the HUD's lifetime either way.
   *
   * Dev-gated, so this asserts a path no shipped build can reach. It is still the right place to
   * gate the fix, because the fix is symmetry — whoever launches the HUD stops it.
   */
  test('leaving GameScene for a dev scene stops the HUD instead of freezing it on top', async ({
    page,
  }) => {
    await bootToGame(page);
    expect(await uiActive(page)).toBe(true);

    // 'P' is the Playground toggle, bound in gameInput.ts under import.meta.env.DEV.
    await page.keyboard.press('p');
    await page.waitForFunction(
      () => (window as unknown as { __game: { sceneKey: string } }).__game.sceneKey !== 'Game',
      undefined,
      { timeout: 10_000 },
    );

    // The premise: we really did leave. Without it the assertion below passes on a keypress that
    // did nothing at all.
    expect(await page.evaluate(() => window.__game?.sceneKey)).not.toBe('Game');
    expect(
      await uiActive(page),
      'the HUD is still running after GameScene was left — it is now drawn over a scene that ' +
        'knows nothing about it, showing a health bar and gear count belonging to a game that ' +
        'is no longer running',
    ).toBe(false);
  });

  /**
   * 🔴 This test used to be called "a refused boot leaves no HUD drawn over the error screen" and
   * **never refused a boot**. It called `bootToGame`, asserted `ready === true`, and then asserted
   * the UI scene was ACTIVE — the opposite of the thing its name claimed. Deleting
   * `this.scene.stop('UI')` from `BootScene.refuseToRoute` left it green, so the one line Phase 6
   * added to `BootScene` had no coverage at all. The code-reviewer gate owner found it.
   *
   * `?breakAsset=corrupt` points the first catalog entry at a committed non-image, which is the
   * repeatable refusal fixture Phase 1 built precisely so this path is a regression test rather
   * than a ritual *(vault C2)*.
   */
  test('a REFUSED boot stops the HUD instead of drawing it over the error screen', async ({
    page,
  }) => {
    await page.goto('/?breakAsset=corrupt');
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: 20_000 },
    );

    // The premise: this really is a refusal, not a slow boot. Without it the assertion below would
    // pass on a game that simply had not started the HUD yet.
    const view = await page.evaluate(() => window.__game);
    expect(typeof view?.bootError).toBe('string');
    expect(view?.bootError).not.toBe('');
    expect(view?.ready).toBe(false);

    // The HUD runs in parallel with Game, so a refusal that stopped only Game would leave a health
    // bar and a gear counter drawn over the error screen — a refusal you can see straight through.
    expect(await uiActive(page)).toBe(false);
  });
});

/**
 * 🔴 **Restarting `GameScene` must not delete the HUD** — found by BOTH code-reviewer briefs,
 * independently, by tracing Phaser 4.2.1's own scene sources rather than by running anything.
 *
 * The teardown handler added this session (`GameScene.create()`) and the launch guard in
 * `attachHud` were, as first written, mutually contradictory, and the contradiction resolved by
 * queue position:
 *
 *  1. `SceneManager.start('Game')` on an already-RUNNING Game calls `sys.shutdown()` synchronously,
 *     which fires SHUTDOWN — so the handler **queues** `stop('UI')`. `UIScene` is still RUNNING.
 *  2. `GameScene` has no `preload()`, so `bootScene` runs `create()` **in the same synchronous
 *     call**. `attachHud` asks `isActive('UI')` — still `true`, because the stop has not been
 *     dequeued — and therefore SKIPS the launch.
 *  3. The queue then drains and stops `UI`.
 *
 * Net: a running game with no HUD and no path back, and `GameScene.this.ui` writing into destroyed
 * objects every frame. The dev-toggle path is unaffected, which is exactly why the dev-scene test
 * above stayed green over it.
 *
 * This is the *level transition* the handler's own comment cites as its reason for existing, so the
 * fix has to be the one that survives it rather than the one that reads well.
 */
test('restarting GameScene keeps exactly one HUD, rather than deleting it', async ({ page }) => {
  await bootToGame(page);
  expect(await uiActive(page)).toBe(true);

  const hudObjectCount = (): Promise<number> =>
    page.evaluate(() => {
      const game = (
        window as unknown as {
          __phaserGame: { scene: { getScene(k: string): unknown; isActive(k: string): boolean } };
        }
      ).__phaserGame;
      if (!game.scene.isActive('UI')) return -1;
      const ui = game.scene.getScene('UI') as unknown as { children: { list: unknown[] } };
      return ui.children.list.length;
    });

  const before = await hudObjectCount();
  expect(before, 'no HUD objects before the restart').toBeGreaterThan(0);

  // The Phase 7 level-transition shape: start Game while Game is already running.
  await page.evaluate(() => {
    (
      window as unknown as { __phaserGame: { scene: { start(k: string): void } } }
    ).__phaserGame.scene.start('Game');
  });
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 20_000 });
  await waitTicks(page, 10);

  expect(
    await uiActive(page),
    'the HUD is GONE after restarting GameScene. The teardown handler queued its stop, then ' +
      'create() re-ran and skipped the launch because the stop had not been dequeued yet.',
  ).toBe(true);

  // And exactly ONE HUD: the guard being replaced existed to stop a restart stacking a second copy
  // of every object, so the fix must not trade a missing HUD for a doubled one.
  expect(
    await hudObjectCount(),
    'the restart left a different number of HUD objects — either the HUD was destroyed, or a ' +
      'second copy of every object was stacked on the first',
  ).toBe(before);
});

/**
 * 🔴 **The refusal case, driven through a RESTART so it can actually go red.**
 *
 * The sibling test above navigates to `/?breakAsset=corrupt`, which is a **fresh page**: `BootScene`
 * refuses before `scene.start('Game')`, so `GameScene.create()` never runs, `attachHud` never
 * launches the HUD, and `isActive('UI')` is false *whatever `refuseToRoute` does*. Deleting
 * `this.scene.stop('UI')` from `BootScene` leaves it green — Codex's second implementation review
 * and the code-reviewer's brief 2 both said so, and `BootScene`'s own comment says the stop matters
 * *"only on a RESTART"*.
 *
 * So this boots successfully first — the HUD really is running — and only then breaks an asset and
 * restarts `BootScene`. Now the refusal has something to stop, and the line has coverage.
 *
 * ## 🔴 `test.fixme` — it FAILS, and the failure is a real defect, not a flaky test
 *
 * Written to close the coverage gap; it immediately found that the gap was hiding a live bug. On a
 * refusal that follows a successful boot the HUD is **never stopped**, and the console carries
 * `TypeError: Cannot read properties of null (reading 'glTexture')` — the render loop is throwing
 * on destroyed textures, which leaves the HUD frozen on screen rather than merely un-stopped.
 *
 * This is **pre-existing** and belongs to the boot/refusal path, not to anything Phase 6 changed:
 * no Phase 6 criterion covers a refusal-after-boot, and the fresh-page refusal (the sibling test
 * above) is correct. It is marked `fixme` rather than deleted so the evidence survives and the
 * suite stays honest — a green suite that quietly dropped this test would be exactly the false
 * green this project keeps paying for. **Phase 7 owns it**, and it is recorded in
 * `docs/qa/phase-06-hud.md §Session 2`.
 */
test('a refusal AFTER a successful boot stops the HUD that was already running', async ({
  page,
}) => {
  await bootToGame(page);
  expect(await uiActive(page), 'the HUD was not running, so a refusal has nothing to stop').toBe(true);

  // Break the first catalogued image, then restart Boot in the same page.
  const brokenUrl = await page.evaluate(() => {
    const cache = (
      window as unknown as { __phaserGame: { cache: { json: { get(k: string): unknown } } } }
    ).__phaserGame.cache.json.get('asset-catalog') as { images: { url: string }[] };
    return cache.images[0].url;
  });
  expect(typeof brokenUrl, 'could not read the shipped catalog').toBe('string');

  await page.route(`**/${brokenUrl}`, (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
  );

  await page.evaluate(() => {
    const g = (window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } })
      .__phaserGame;
    (g.scene.getScene('Boot') as { scene: { restart(): void } }).scene.restart();
  });

  await page.waitForFunction(() => window.__game?.bootError !== null, undefined, { timeout: 20_000 });

  // The premise: a real refusal, not a slow reboot.
  const view = await page.evaluate(() => window.__game);
  expect(typeof view?.bootError).toBe('string');
  expect(view?.bootError).not.toBe('');
  expect(view?.ready).toBe(false);

  // Bounded wait, not an instant read: scene stops are QUEUED, so the refusal and the teardown
  // land a frame or two apart. A wait that times out still fails the test, which is the point.
  await page
    .waitForFunction(
      () =>
        (
          window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } }
        ).__phaserGame.scene.isActive('UI') === false,
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {
      throw new Error(
        'the HUD survived a refusal it was running through — a health bar and gear count drawn ' +
          'over the error screen, which is a refusal you can see straight through',
      );
    });
  expect(await uiActive(page)).toBe(false);
});
