import { expect, test } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH } from '../../src/game/constants';

/**
 * # The game at device pixel ratio 2 — inventory 2b.6
 *
 * *"DPR ≠ 1 never tested."* Recorded in Phase 6, carried to Phase 9, carried again into this
 * session's inventory, and still open when the UI/UX gate owner re-found it. `phase-06-chrome.spec.ts`
 * says so in its own words:
 *
 * > `deviceScaleFactor` other than 1 is still unexercised and is recorded as deferred: `autoRound`
 * > floors CSS sizes, so DPR 1.25/1.5 could round asymmetrically.
 *
 * **Most laptops are HiDPI.** DPR 2 is not an edge case; it is the common case, and it was the
 * untested one.
 *
 * ## What this can and cannot settle
 *
 * `Phaser.Scale.FIT` sizes off CSS pixels (`innerWidth`/`innerHeight`), which DPR does not change —
 * so the letterbox/pillarbox geometry *should* be identical at DPR 1 and DPR 2, and the assertions
 * below are the same ones `phase-06-chrome.spec.ts` makes. That prediction is exactly what needs a
 * test: it is a claim about Phaser's internals, and the project's rule is that engine behaviour is
 * measured, not assumed *(ENGINE-NOTES.md's whole purpose)*.
 *
 * ✅ **And sharpness turned out to be a non-issue — measured, against a prediction that was wrong.**
 * This header first said the backing store would be sized in CSS pixels and upscaled on a DPR-2
 * display. The last test measured **1920 px of backing store for an 852 px CSS canvas**: `FIT` keeps
 * the render target at the game size at every window size and DPR, so at 852 CSS px on a DPR-2
 * display the frame is **downsampled** from 1920 to 1704 device px rather than upscaled. There is no
 * DPR-2 blur to fix, which is what 2b.6 was really asking. See ENGINE-NOTES.md.
 *
 * ## The false-green shape this file is exposed to
 *
 * This spec runs under its own Playwright project, and a project whose `testMatch` selects nothing
 * reports `0 passed` and exits 0 — indistinguishable from success. The first test asserts the DPR
 * the browser is actually running at, so a project misconfiguration fails loudly instead of
 * vanishing.
 */

const MIN_W = 852;
const MIN_H = 480;

async function canvasBox(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const r = c.getBoundingClientRect();
    return {
      top: r.top,
      bottom: window.innerHeight - r.bottom,
      left: r.left,
      right: window.innerWidth - r.right,
      width: r.width,
      height: r.height,
      backingWidth: c.width,
      backingHeight: c.height,
      dpr: window.devicePixelRatio,
    };
  });
}

test.describe('Phase 6 — DPR 2 (inventory 2b.6)', () => {
  test('the browser really IS at DPR 2 — otherwise every test here is about DPR 1', async ({
    page,
  }) => {
    // The non-vacuity gate for the whole file, and for the project that selects it. A `testMatch`
    // that picked nothing, or a project that lost its `deviceScaleFactor`, would leave this file
    // silently measuring the case it exists to escape.
    await page.setViewportSize({ width: MIN_W, height: MIN_H });
    await bootToGame(page);
    const box = await canvasBox(page);
    expect(box.dpr, `devicePixelRatio is ${box.dpr}, not 2 — this project is misconfigured`).toBe(2);
  });

  test('boots to a running game at the smallest supported window', async ({ page }) => {
    // `ready`, not a sleep. A DPR-2 boot that refused would be a real defect and must not present
    // as a layout failure three assertions later.
    await page.setViewportSize({ width: MIN_W, height: MIN_H });
    await bootToGame(page);
    const state = await page.evaluate(() => window.__game);
    expect(state?.bootError, 'the game refused to route at DPR 2').toBeNull();
    expect(state?.ready).toBe(true);
  });

  // The same three viewports `phase-06-chrome.spec.ts` uses, deliberately: the claim under test is
  // that DPR does not change this geometry, and the only way to say that is to ask the identical
  // question at both ratios and compare. Rewritten with that file on 2026-09-01 — 2000x900 FILLS
  // now that the view fills the screen rather than pillarboxing, and the over-ceiling case is new.
  const CEILING_ASPECT = MAX_GAME_WIDTH / GAME_HEIGHT;
  const DESIGN_ASPECT = GAME_WIDTH / GAME_HEIGHT;

  for (const [w, h, boxing] of [
    [1400, 900, 'letterboxed'],
    [2000, 900, 'fills'],
    [2600, 1000, 'pillarboxed'],
  ] as const) {
    test(`a ${boxing} viewport (${w}x${h}) still centres at DPR 2`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);
      const box = await canvasBox(page);

      expect(typeof box.top).toBe('number');
      expect(Math.abs(box.top - box.bottom), `${boxing} at DPR 2: vertical gaps unequal`).toBeLessThanOrEqual(1);
      expect(Math.abs(box.left - box.right), `${boxing} at DPR 2: horizontal gaps unequal`).toBeLessThanOrEqual(1);

      // Equal gaps are satisfied by a canvas of the wrong size that happens to be centred — a
      // zero-width canvas has perfectly equal gaps. The drawn aspect is the viewport's own, clamped
      // into [16:9, ceiling]; DPR must not change which side of those bounds it lands on.
      expect(box.width).toBeGreaterThan(0);
      const wanted = Math.min(Math.max(w / h, DESIGN_ASPECT), CEILING_ASPECT);
      expect(
        Math.abs(box.width / box.height - wanted),
        `${boxing} at DPR 2: canvas is ${box.width}x${box.height}, aspect ` +
          `${(box.width / box.height).toFixed(4)} against ${wanted.toFixed(4)}`,
      ).toBeLessThan(0.01);

      if (boxing === 'letterboxed') {
        expect(box.top, 'letterboxed: expected vertical slack').toBeGreaterThan(0);
      } else if (boxing === 'pillarboxed') {
        expect(box.left, 'pillarboxed: expected horizontal slack past the ceiling').toBeGreaterThan(0);
      } else {
        expect(box.left, 'fills: a black bar survived at DPR 2').toBeLessThanOrEqual(1);
      }
    });
  }

  test('the canvas is never pushed outside the viewport', async ({ page }) => {
    for (const [w, h] of [
      [MIN_W, MIN_H],
      [1280, 720],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);
      const box = await canvasBox(page);
      expect(box.left, `${w}x${h}: canvas starts left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.top, `${w}x${h}: canvas starts above the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.width, `${w}x${h}: canvas is wider than the viewport`).toBeLessThanOrEqual(w + 1);
      expect(box.height, `${w}x${h}: canvas is taller than the viewport`).toBeLessThanOrEqual(h + 1);
    }
  });

  test('the HUD is fully on screen at 852x480, DPR 2', async ({ page }) => {
    // The reading the S.7 gate owner could not take. `hudFits` is the same predicate the unit suite
    // uses, applied to the live scene — one criterion, one definition *(the `viewFits` precedent)*.
    await page.setViewportSize({ width: MIN_W, height: MIN_H });
    await bootToGame(page);
    const fits = await page.evaluate(() => {
      const game = (window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } })
        .__phaserGame;
      const ui = game.scene.getScene('UI') as { layout?: { plate: { x: number; y: number; w: number; h: number } } };
      const plate = ui.layout?.plate;
      if (plate === undefined) return null;
      return {
        right: plate.x + plate.w,
        bottom: plate.y + plate.h,
        w: window.innerWidth,
        h: window.innerHeight,
      };
    });
    expect(fits, 'the UI scene exposed no layout — the HUD may not have been built').not.toBeNull();
    expect(fits!.right).toBeLessThanOrEqual(fits!.w);
    expect(fits!.bottom).toBeLessThanOrEqual(fits!.h);
  });

  test('the backing store is the DESIGN size at every DPR — measured, not assumed', async ({
    page,
  }) => {
    /**
     * 🔴 **This test was written asserting the opposite, and the measurement corrected it.** That is
     * the entry, and it is why 2b.6 was worth running rather than reasoning about.
     *
     * The prediction was: the game sets no `resolution`, so Phaser's default of 1 applies, the
     * backing store is sized in CSS pixels, and a DPR-2 display upscales it. **Measured: the backing
     * store is 1920 px for an 852 px CSS canvas.**
     *
     * `Phaser.Scale.FIT` keeps the backing store at the GAME size — 1920 × 1080 — and scales the
     * canvas with CSS. So the render target is the design resolution at every window size and every
     * DPR, and the browser resamples to fit.
     *
     * The consequence is better than the prediction, not worse. At 852 CSS px on a DPR-2 display the
     * physical canvas is 1704 device px and the backing store is 1920 — the frame is **downsampled**,
     * i.e. supersampled, rather than upscaled. There is no DPR-2 sharpness problem to fix, which is
     * what item 2b.6 was actually asking.
     *
     * ⚠️ It also means the GPU cost does not fall on a small window: the game always rasterises
     * 1920 × 1080. That is the real trade this policy makes, and it is recorded in ENGINE-NOTES.md
     * rather than left to be rediscovered.
     *
     * A red here means someone set an explicit `resolution`, or Phaser changed `FIT`'s behaviour.
     * Either is a decision for ENGINE-NOTES.md, not a number to update here.
     */
    for (const [w, h] of [
      [MIN_W, MIN_H],
      [1400, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);
      const box = await canvasBox(page);
      expect(box.dpr).toBe(2);
      expect(
        [box.backingWidth, box.backingHeight],
        `at ${w}x${h} DPR ${box.dpr} the backing store is ${box.backingWidth}x${box.backingHeight}, ` +
          `not the 1920x1080 design size. The resolution policy changed — record it in ` +
          `ENGINE-NOTES.md rather than editing this assertion.`,
      ).toEqual([1920, 1080]);
      // And the CSS box is genuinely smaller, so the backing store really is being resampled rather
      // than the viewport happening to be the design size.
      expect(box.width).toBeLessThan(1920);
    }
  });
});
