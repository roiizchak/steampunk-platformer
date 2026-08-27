/**
 * The controls banner sits beside the gear counter and covers nothing.
 *
 * ## The defect
 *
 * The owner played the production build and reported the controls text drawn across the play area.
 * It was: `addHelpBanner` put it at a fixed `(HUD_MARGIN, HUD_MARGIN * 3 + HUD_PLATE.h)`, wrapped to
 * the full 1872 px view width — a strip of 44 px bold text spanning the whole screen below the HUD
 * plate. It has moved into the empty band to the RIGHT of the counter, on the HUD's own row.
 *
 * ## Why this file exists at all
 *
 * **Nothing in the suite asserted the banner existed.** `addHelpBanner` returned `void` and
 * `GameScene` discarded the `Text`, so deleting the draw call outright left everything green —
 * Codex plan review round 1, finding 3. The layer now returns the object through
 * `HudAttachment.banner`, and `bannerHelpers.ts` reads it.
 *
 * ## What this file deliberately does NOT assert
 *
 * **A row count.** The owner's decision this session was *"keep every key printed, allow three
 * lines"*, so the number of rows is an output, not a contract — pinning it would gate the wrong
 * thing and go red the next time a key is added. What is gated is clearance and containment: the
 * banner clears the counter, overlaps no HUD object, and stays on screen. Those hold at any row
 * count and are what the owner actually reported.
 *
 * ## Runs in the default `chromium` project
 *
 * Every assertion here is about geometry Phaser computes from the browser's own `measureText()`,
 * which SwiftShader performs exactly as a GPU would — this is not a rasterisation claim, so it does
 * not need `chromium-gpu`. The PRODUCTION half of the criterion cannot use this probe at all
 * (`dist/` ships no `window.__phaserGame`) and lives in `phase-10-production.spec.ts` as a pixel
 * assertion instead.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';
import { readBanner } from './bannerHelpers';
import { readHud } from './hudHelpers';
import { HUD_MARGIN } from '../../src/render/hud';

/** Do two rectangles share any area? Half-open, so touching edges are not an overlap. */
function overlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function bannerAndHud(page: import('@playwright/test').Page) {
  const hud = await readHud(page);
  const banner = await readBanner(page);
  return { hud, banner };
}

/** Assert the banner clears the HUD and stays on screen, at whatever size the game currently is. */
function assertPlaced(
  hud: Awaited<ReturnType<typeof readHud>>,
  banner: Awaited<ReturnType<typeof readBanner>>,
): void {
  const plate = {
    left: hud.plate.x,
    right: hud.plate.x + hud.plate.w,
    top: hud.plate.y,
    bottom: hud.plate.y + hud.plate.h,
  };
  const counter = {
    left: hud.counter.x,
    right: hud.counter.x + hud.counter.w,
    top: hud.counter.y,
    bottom: hud.counter.y + hud.counter.h,
  };

  expect(banner.exists, 'the scene is holding no banner at all').toBe(true);
  expect(banner.willRender, 'the banner exists but would not be drawn').toBe(true);

  expect(
    overlaps(banner.bounds, plate),
    `the banner ${JSON.stringify(banner.bounds)} overlaps the HUD plate ${JSON.stringify(plate)}`,
  ).toBe(false);
  expect(overlaps(banner.bounds, counter), 'the banner overlaps the gear counter').toBe(false);

  // 🔴 The owner's actual complaint, as a number: the banner starts to the RIGHT of the counter.
  expect(
    banner.bounds.left,
    `the banner starts at ${banner.bounds.left}, left of the counter's right edge ${counter.right}`,
  ).toBeGreaterThanOrEqual(counter.right);

  // And it is contained: nothing runs off any edge of the view.
  expect(banner.bounds.top, 'the banner runs off the top of the screen').toBeGreaterThanOrEqual(0);
  expect(banner.bounds.left).toBeGreaterThanOrEqual(0);
  expect(
    banner.bounds.right,
    'the banner runs past the right margin into the edge of the screen',
  ).toBeLessThanOrEqual(banner.gameSize.width - HUD_MARGIN * hud.layout.scale + 1);
  expect(banner.bounds.bottom, 'the banner runs off the bottom of the screen').toBeLessThanOrEqual(
    banner.gameSize.height,
  );
}

test.describe('the controls banner is placed beside the HUD, not over the level', () => {
  test('exists, is drawn, and clears the counter at the design size', async ({ page }) => {
    await bootToGame(page);
    const { hud, banner } = await bannerAndHud(page);

    assertPlaced(hud, banner);

    // Non-vacuity: it is a real legend, not an empty string that trivially overlaps nothing.
    expect(banner.text.length, 'the banner is empty — every bounds check above is vacuous').toBeGreaterThan(
      40,
    );
    expect(banner.text, 'the legend lost the movement keys').toContain('move');
    expect(banner.bounds.right).toBeGreaterThan(banner.bounds.left);
  });

  /**
   * 🔴 A real `game.scale.resize()`, which is the path `phase-06-chrome.spec.ts:194` already drives.
   *
   * Under `FIT` a browser resize never changes `scale.gameSize`, so a viewport change would test
   * nothing here. `UIScene` re-lays-out the whole plate through `hudLayout()` on this event while
   * the banner used to stay at raw design pixels — Codex round 1, finding 4.
   */
  test('follows the HUD through a real scale.resize()', async ({ page }) => {
    await bootToGame(page);
    const before = await bannerAndHud(page);
    expect(before.banner.gameSize.height).toBe(1080);

    await page.evaluate(() => {
      (
        window as unknown as { __phaserGame: { scale: { resize(w: number, h: number): void } } }
      ).__phaserGame.scale.resize(1280, 720);
    });
    await waitTicks(page, 4);

    const after = await bannerAndHud(page);
    expect(after.banner.gameSize.width).toBe(1280);
    assertPlaced(after.hud, after.banner);
    // It genuinely moved rather than happening to satisfy the same bounds at both sizes.
    expect(after.banner.bounds.left, 'the banner did not move with the HUD').not.toBe(
      before.banner.bounds.left,
    );

    // And again at the smallest size this project supports, where the band is narrowest.
    await page.evaluate(() => {
      (
        window as unknown as { __phaserGame: { scale: { resize(w: number, h: number): void } } }
      ).__phaserGame.scale.resize(852, 480);
    });
    await waitTicks(page, 4);
    const small = await bannerAndHud(page);
    expect(small.banner.gameSize.width).toBe(852);
    assertPlaced(small.hud, small.banner);
  });

  /**
   * The Playground legend is a different, LONGER string (`PlaygroundScene.ts`), and it was ungated
   * — Codex round 2, finding 5. It reaches the same layer through the same `attachHud` call by
   * virtual dispatch on `helpText()`, which is the claim being checked: the override survives.
   *
   * ## ⚠️ `readHud` is deliberately NOT used here, and the reason is a real finding
   *
   * **The parallel HUD scene is not running in a dev scene.** `UIScene.update()` hardcodes
   * `this.scene.get('Game')` and stops itself when that scene goes away, so switching to
   * `Playground` leaves `scene.isActive('UI')` false — which is exactly Codex round 2, finding 2,
   * confirmed live rather than from the source. `readHud` waits on that flag and times out.
   *
   * That is pre-existing and out of scope for this session (it is in the plan's *Out of scope*
   * list: making `UIScene`'s owner key dynamic is its own change). What matters here is that the
   * banner still LAYS OUT — measured at x = 624 in a probe, from the stopped scene's last counter
   * geometry — rather than being stranded at the origin, on top of the play area, which is the
   * defect this whole session is about. So the assertion is containment and non-origin, not
   * clearance against a HUD that is not on screen.
   */
  test('the Playground legend is placed by the same rule', async ({ page }) => {
    await bootToGame(page);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.sceneKey === 'Playground', undefined, {
      timeout: 20_000,
    });

    const banner = await readBanner(page);
    expect(banner.exists, 'the dev scene is holding no banner at all').toBe(true);
    expect(banner.willRender).toBe(true);
    expect(banner.text, 'the Playground override did not reach the banner').not.toBe('');
    expect(banner.text.length).toBeGreaterThan(40);

    // 🔴 Not at the origin: an unlaid-out banner sits at (0, 0), across the top-left of the level.
    expect(banner.bounds.left, 'the dev-scene banner never laid out').toBeGreaterThan(100);
    expect(banner.bounds.top).toBeGreaterThanOrEqual(0);
    expect(banner.bounds.right).toBeLessThanOrEqual(banner.gameSize.width);
    expect(banner.bounds.bottom).toBeLessThanOrEqual(banner.gameSize.height);
  });
});
