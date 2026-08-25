import { expect, test } from '@playwright/test';

import { bootToGame } from './gameHarness';

/**
 * 🔴 **The page must not SCROLL, and the whole canvas must be visible.** Found 2026-08-25 by the
 * play-owned capture round — by looking at a screenshot, which is what that lane is for.
 *
 * `index.html` sized `#game` at `100vw x 100vh`. `100vw` is the viewport *including* the scrollbar
 * gutter, and a `<canvas>` is `display: inline` so its line box adds ~4 px below it. At any viewport
 * where FIT fills the height exactly, those 4 px produced a vertical scrollbar, `100vw` then exceeded
 * the client width and produced a horizontal one, and the game lost its bottom and right **15 px**
 * behind them. Measured on the shipped page: `1920x1084` scrolled inside a `1905x1065` client area.
 *
 * ⚠️ **Criterion 6.7 could not see it, and neither could 6.3.** Both viewports 6.7 uses are
 * deliberately NOT 16:9 — chosen so the boxing gaps exist to measure — and at 1400x900 the canvas is
 * 787 px tall inside a 900 px div, which absorbs the descender. The one aspect ratio the game is
 * actually authored for was the one nothing looked at. And 6.7 measured centring inside the
 * OVERFLOWING box: at 2000x900 it read 200 px of gap on the left against **185** on the right and
 * passed anyway.
 *
 * So this asserts two things 6.7 does not: the document does not scroll, and the canvas is inside
 * the **client** area rather than inside `#game`.
 */
test.describe('the page does not scroll and the canvas is fully visible', () => {
  for (const [w, h, why] of [
    [1920, 1080, 'the design size — exactly 16:9, the case nothing covered'],
    [1280, 720, '16:9 again, smaller'],
    [852, 480, 'the smallest supported size'],
    [2000, 900, 'pillarboxed — where 6.7 read 200 against 185'],
  ] as const) {
    test(`${w}x${h}: ${why}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        const c = document.querySelector('canvas')!.getBoundingClientRect();
        return {
          overflowX: d.scrollWidth - d.clientWidth,
          overflowY: d.scrollHeight - d.clientHeight,
          left: c.left,
          top: c.top,
          right: d.clientWidth - c.right,
          bottom: d.clientHeight - c.bottom,
          fillX: c.width / d.clientWidth,
          fillY: c.height / d.clientHeight,
        };
      });
      // 🔴 Type before value: a selector that found nothing would satisfy a numeric comparison by
      // coercion and report a clean page.
      expect(typeof m.overflowX, 'the measurement returned a non-number').toBe('number');
      expect(m.overflowX, `the page scrolls ${m.overflowX} px horizontally at ${w}x${h}`).toBeLessThanOrEqual(0);
      expect(m.overflowY, `the page scrolls ${m.overflowY} px vertically at ${w}x${h}`).toBeLessThanOrEqual(0);
      // 🔴 **The canvas is really there, checked BEFORE the edge gaps.** A 0x0 canvas parked at the
      // origin satisfies all four gaps and both overflow assertions — every claim below is true of a
      // game that draws nothing. Named by the 8.7 adversarial brief. Phaser fits the 16:9 canvas to
      // the window, so exactly one axis is filled and the other letterboxes; the max of the two
      // ratios is therefore ~1 whenever the canvas is sized at all, at every viewport in this list.
      const fill = Math.max(m.fillX, m.fillY);
      expect(
        fill,
        `the canvas covers ${(fill * 100).toFixed(1)} % of the ${w}x${h} client area on its filled ` +
          'axis — it is collapsed or absent, and the geometry below is vacuously satisfied',
      ).toBeGreaterThan(0.99);

      for (const [edge, gap] of Object.entries({ left: m.left, top: m.top, right: m.right, bottom: m.bottom })) {
        expect(gap, `${gap.toFixed(1)} px of the canvas is off the ${edge} edge at ${w}x${h}`).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
