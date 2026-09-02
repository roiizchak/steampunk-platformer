/**
 * **The tap zones follow the view, and this is the half that needs a touch device.**
 *
 * `phase-13-viewfill.spec.ts` covers the backing store, the camera and the parallax — all true with
 * or without touch, so it runs on the cheap desktop project. The on-screen routes are different:
 * `attachTapRoutes` is a no-op unless Phaser DETECTS touch (`game.device.input.touch`, from
 * `ontouchstart` or `navigator.maxTouchPoints`), and criterion 12.7 is that desktop gains no hit
 * targets at all. A zone case in that file would `test.skip` itself in the only project that
 * collects it and report a green tick for a gate that never executed — which is why this is a
 * separate FILE rather than a separate case. `specRouting.ts` says why one file cannot simply be
 * given two projects.
 *
 * ## The screen under test is the LEVEL MENU, and that was measured rather than assumed
 *
 * Tap routes belong to the three screens that have them — `TitleScene`, `LevelSelectScene` and the
 * completion panel — never to gameplay, whose controls are a different layer entirely. On a touch
 * device `bootToTitle` lands on the **level menu**: probing every scene's display list found five
 * `Zone`s under `LevelSelect` and none anywhere else. So the scan below sweeps every ACTIVE scene
 * rather than naming one, and the non-vacuity assertion is what keeps that honest — a sweep that
 * finds nothing fails loudly instead of passing on an empty set.
 *
 * ## What it proves
 *
 * `attachTapRoutes` builds its `Zone`s once, in a `for` loop over the targets it was handed. Before
 * the view could change, that was the whole truth. Now a rotation or a fullscreen toggle moves the
 * drawn content and the zones stay where they were built — a tap landing on nothing, or on the
 * wrong control. `keepTapRoutesSized` is the repair and this is what watches it work.
 */

import { expect, test } from '@playwright/test';
import { bootToTitle } from './titleHarness';

/** Every active scene, enough of each to find its `Zone`s. */
type ProbeHandle = {
  scene: {
    scenes: { scene: { isActive(): boolean }; children?: { list: unknown[] } }[];
  };
};

/** The right-hand edge of the furthest-right hit zone on screen, in game units. -1 when none. */
async function zoneRightEdge(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const g = (window as unknown as { __phaserGame?: ProbeHandle }).__phaserGame;
    const zones: { x: number; width: number }[] = [];
    for (const s of g?.scene.scenes ?? []) {
      if (!s.scene.isActive()) continue;
      for (const o of s.children?.list ?? []) {
        if ((o as { type?: string }).type === 'Zone') zones.push(o as { x: number; width: number });
      }
    }
    return zones.length === 0 ? -1 : Math.max(...zones.map((z) => z.x + z.width));
  });
}

test('the tap zones move with the view, not with where they were built', async ({ page }) => {
  // Exactly 16:9, so the view starts at the design width and the widening below is unambiguous.
  await page.setViewportSize({ width: 1024, height: 576 });
  await bootToTitle(page);

  const before = await zoneRightEdge(page);
  // Non-vacuity, and NOT a `test.skip`: this project sets `hasTouch`, so no zones means the routes
  // did not attach and the rest of this spec would be measuring an empty display list.
  expect(before, 'no tap zones were drawn — this spec would prove nothing').toBeGreaterThan(0);

  // 🔴 `bootToTitle` taps the canvas, and on a touch device that tap goes FULLSCREEN
  // (`installFullscreenOnTap`) — after which Chromium refuses `setViewportSize` outright:
  // *"To resize minimized/maximized/fullscreen window, restore it to normal state first."* So the
  // resize below has to leave fullscreen first. This is not a workaround for the spec's sake: it is
  // the same pair of events a player produces, in the same order.
  await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
  await page.waitForFunction(() => document.fullscreenElement === null);

  // EXACTLY 20:9 (2.2222), a landscape phone's aspect, inside the 2.37 ceiling, so the view widens
  // to exactly 2400. 1024x461 was here first and is 2.2213, which rounds the view to 2399 — near
  // enough to read as 2400 and wrong enough to fail an equality, which is how these viewports
  // earned their exact numbers.
  await page.setViewportSize({ width: 1000, height: 450 });
  await expect
    .poll(() => zoneRightEdge(page), {
      message:
        'the zones never moved after the resize — they are still where they were built, so a tap ' +
        'on the right of the screen now lands on nothing',
    })
    .toBeGreaterThan(before);
});
