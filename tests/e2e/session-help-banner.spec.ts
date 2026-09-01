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
import { HUD_MARGIN, HUD_PLATE } from '../../src/render/hud';
import {
  HELP_BANNER_MAX_ROWS,
  HELP_FONT_PX,
  HELP_LINE_BOX_SLACK,
  HELP_LINE_HEIGHT_RATIO,
} from '../../src/render/helpBanner';

/** Playwright creates the parent directories for a screenshot path, so nothing here makes them. */
const EVIDENCE = 'docs/evidence/session-hud-and-pits';

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

  /**
   * 🔴 Bounded against the HUD BAND, not against the screen.
   *
   * This used to stop at `bottom <= gameSize.height`, and the UI/UX gate owner (brief 2, finding 4)
   * showed what that permits: add one word to the legend, the block goes from three rows to four to
   * twenty, hangs from y = 24 down to y = 1000 over the entire play area — and every assertion above
   * still passes, because 1000 is less than 1080. The spec bounded the banner against the screen
   * while the defect it exists for is about the PLAY AREA.
   *
   * The ceiling is `HELP_BANNER_MAX_ROWS`, whose block explains why it is four and why three rows
   * already overflow the plate. This is not the row-count pin the header refuses — that would be an
   * equality, and would red the next time a key is added. It is a ceiling with room in it.
   */
  // 🔴 The row COUNT itself, not only the pixel ceiling derived from it. Codex implementation
  // review, finding 7: `maxBottom` allows 4.2 nominal rows once the line-box slack is folded in, so
  // the ceiling alone answers a slightly different question than the one it is named for. This
  // asserts the thing `HELP_BANNER_MAX_ROWS` actually says. It is still a ceiling, never an
  // equality — the owner's decision is "every key printed, however many rows that takes".
  expect(
    banner.lines,
    `the legend wrapped to ${banner.lines} rows: ${JSON.stringify(banner.rows)}`,
  ).toBeLessThanOrEqual(HELP_BANNER_MAX_ROWS);

  const maxBottom =
    HUD_MARGIN * hud.layout.scale +
    HELP_BANNER_MAX_ROWS *
      HELP_FONT_PX *
      HELP_LINE_HEIGHT_RATIO *
      HELP_LINE_BOX_SLACK *
      hud.layout.scale;
  expect(
    banner.bounds.bottom,
    `the banner reaches ${banner.bounds.bottom} in ${banner.lines} rows, past the ` +
      `${HELP_BANNER_MAX_ROWS}-row ceiling at ${maxBottom} — it is eating the play area, which is ` +
      'the defect this session exists to fix, in a taller and narrower shape',
  ).toBeLessThanOrEqual(maxBottom + 1);

  // And the honest half, recorded as a number rather than implied away: three rows of 43 px cannot
  // fit a 128 px plate, so the banner DOES extend below the plate's bottom edge. See
  // `HELP_BANNER_MAX_ROWS`. This asserts the overflow is bounded, not that it is absent.
  expect(banner.bounds.top, 'the banner starts below the HUD margin').toBeLessThanOrEqual(
    (HUD_MARGIN + HUD_PLATE.h) * hud.layout.scale,
  );
}

/**
 * 🔴 The banner does not cover the PLAYER — the half of the criterion the HUD rects cannot express.
 *
 * Found by the UI/UX gate owner, brief 1, finding D: `assertPlaced` checks the banner against the
 * plate and the counter and nothing else, so a banner sitting on top of a sprite would satisfy every
 * assertion in this file. And the block genuinely does extend below the HUD plate's bottom edge —
 * measured at design y = 220 in a DEV build's four rows, against a plate that ends at 152 — so
 * "it is inside the HUD's footprint" is **not** true and cannot be the argument.
 *
 * The player is drawn in WORLD space and the banner in SCREEN space, so the comparison has to go
 * through the camera. Done in the page, once, because a scroll value read separately from a player
 * position is two samples of two different frames.
 */
async function assertClearOfPlayer(
  page: import('@playwright/test').Page,
  banner: Awaited<ReturnType<typeof readBanner>>,
): Promise<void> {
  const player = await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      cameras: { main: { scrollX: number; scrollY: number; zoom: number; x: number; y: number } };
      playerSprite?: { getBounds(): { left: number; right: number; top: number; bottom: number } };
    };
    const cam = scene.cameras.main;
    const b = scene.playerSprite?.getBounds();
    if (!b) return null;
    // 🔴 `+ cam.x` / `+ cam.y`, because this camera is NOT at the origin. `gameEffects.ts` moves
    // GameScene's camera to `(-margin.x, -margin.y)` so a shake never uncovers the view edge, so a
    // world point converted with scroll and zoom alone lands ~10 px right and ~8 px down of where
    // it is actually drawn. The banner's own bounds are converted the same way in
    // `bannerHelpers.ts`; this half was missed. Codex implementation review, finding 1.
    return {
      left: (b.left - cam.scrollX) * cam.zoom + cam.x,
      right: (b.right - cam.scrollX) * cam.zoom + cam.x,
      top: (b.top - cam.scrollY) * cam.zoom + cam.y,
      bottom: (b.bottom - cam.scrollY) * cam.zoom + cam.y,
    };
  });

  expect(player, 'no drawn player to compare against — this check would be vacuous').not.toBeNull();
  expect(
    overlaps(banner.bounds, player!),
    `the controls banner ${JSON.stringify(banner.bounds)} is drawn over the player ` +
      `${JSON.stringify(player)} — which is the defect the owner reported, at a smaller size`,
  ).toBe(false);
}

test.describe('the controls banner is placed beside the HUD, not over the level', () => {
  test('exists, is drawn, and clears the counter at the design size', async ({ page }) => {
    await bootToGame(page);
    const { hud, banner } = await bannerAndHud(page);

    assertPlaced(hud, banner);
    await assertClearOfPlayer(page, banner);

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
  /**
   * 🔴 **Rewritten 2026-09-01: a real BROWSER resize, and the sizes changed with it.**
   *
   * This drove `game.scale.resize(1280, 720)` directly. That path is no longer reachable:
   * `src/game/viewSize.ts` makes the view a function of the viewport, `scale.resize` emits
   * `resize`, and the fill loop hears it and snaps the view straight back to what the viewport
   * says. A spec driving it measures the loop undoing it.
   *
   * ⚠️ The old second arm — *"the smallest size this project supports, where the band is
   * narrowest"* — is GONE rather than adapted, and that is a reduction worth naming. The view can
   * no longer be narrower than `GAME_WIDTH`: `liveViewWidth` clamps there, so 852 x 480 (1.775,
   * just under 16:9) now letterboxes at a 1920-wide view rather than shrinking the band. The
   * narrowest band the banner can ever be laid out in IS the design width, which the first read
   * below already covers. The widest is the ceiling, and that is the arm that replaces it.
   */
  test('follows the HUD through a real browser resize', async ({ page }) => {
    // Exactly 16:9, so the view starts at the design width.
    await page.setViewportSize({ width: 1024, height: 576 });
    await bootToGame(page);
    const before = await bannerAndHud(page);
    expect(before.banner.gameSize.height).toBe(1080);
    expect(before.banner.gameSize.width, 'a 16:9 viewport should sit at the design width').toBe(1920);

    // EXACTLY 20:9 (2.2222), a landscape phone's aspect, inside the 2.37 ceiling — the view widens
    // to exactly 2400. 1024x461 is 2.2213 and rounds to 2399, which reads as 2400 and fails an
    // equality; that is how these viewports earned their exact numbers.
    await page.setViewportSize({ width: 1000, height: 450 });
    await expect
      .poll(async () => (await bannerAndHud(page)).banner.gameSize.width, {
        message: 'the view never widened after the browser resize',
      })
      .toBe(2400);
    await waitTicks(page, 4);

    const after = await bannerAndHud(page);
    assertPlaced(after.hud, after.banner);
    // 🔴 It genuinely followed the view rather than happening to satisfy the same bounds at both
    // sizes — and the observable is the RIGHT edge, not the left. `bounds.left` is derived from the
    // gear counter, which is left-anchored and scaled off HEIGHT, and height is pinned: it read 624
    // at both sizes and the assertion failed on correct behaviour. What the extra width actually
    // buys is `wrapPx` (`helpBanner.ts:279`), so the banner wraps later and reaches further right.
    expect(
      after.banner.bounds.right,
      'the banner did not use the extra width — its wrap is still bounded by the design view',
    ).toBeGreaterThan(before.banner.bounds.right);
    expect(after.banner.bounds.left, 'the banner left edge is height-derived and must not move').toBe(
      before.banner.bounds.left,
    );

    // And again past the aspect ceiling, where the view clamps at its widest and the band is at
    // its most generous — the other end of the range the banner must lay out in.
    await page.setViewportSize({ width: 1040, height: 400 });
    await expect
      .poll(async () => (await bannerAndHud(page)).banner.gameSize.width, {
        message: 'the view did not clamp at the ceiling',
      })
      .toBe(2560);
    await waitTicks(page, 4);
    const widest = await bannerAndHud(page);
    assertPlaced(widest.hud, widest.banner);
    expect(
      widest.banner.bounds.right,
      'the widest supported view did not give the banner more room than the 20:9 one',
    ).toBeGreaterThan(after.banner.bounds.right);
  });


  /**
   * Evidence, and the row count nobody may assume.
   *
   * The owner reported this defect from four screenshots of the shipped build. A fix to a visual
   * defect with no captured picture of the result is an unverified fix, so the three supported sizes
   * are photographed here rather than in a throwaway script — the evidence is then a by-product of a
   * gate that runs, not a file somebody remembered to make once.
   *
   * ⚠️ The row count is REPORTED, never asserted. Every row-count figure previously written down in
   * this repo was measured at the old 1872 px wrap and is wrong for the band the banner now uses;
   * the numbers this case prints are the live ones. They are not a contract — the owner's decision
   * was to keep every key printed at whatever row count that takes.
   */
  test('captures the placement at every supported size', async ({ page }) => {
    await bootToGame(page);
    const sizes: [number, number][] = [
      [1920, 1080],
      [1280, 720],
      [852, 480],
    ];
    const rows: string[] = [];

    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(
        ([gw, gh]) => {
          (
            window as unknown as { __phaserGame: { scale: { resize(a: number, b: number): void } } }
          ).__phaserGame.scale.resize(gw, gh);
        },
        [w, h],
      );
      await waitTicks(page, 4);

      const { hud, banner } = await bannerAndHud(page);
      assertPlaced(hud, banner);
      await assertClearOfPlayer(page, banner);
      rows.push(
        [
          `${w}x${h}: ${banner.lines} rows, bounds ${JSON.stringify(banner.bounds)}`,
          ...banner.rows.map((r) => `    | ${r}`),
        ].join('\n  '),
      );
      await page.screenshot({ path: `${EVIDENCE}/banner-${w}x${h}.png` });
    }

    console.log(['BANNER PLACEMENT', ...rows].join('\n  '));
    expect(rows.length).toBe(3);
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
