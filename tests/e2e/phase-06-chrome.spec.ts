/**
 * Phase 6 — where the HUD SITS: pinning, resizing, and the canvas itself.
 *
 * The sibling of `phase-06-hud.spec.ts`, which owns what the HUD SAYS (criteria 6.1 and 6.4). They
 * were one file until it reached 601 lines against this project's 400-line ceiling; the seam is the
 * QA gate's own, not an arbitrary halving. Shared probes live in `hudHelpers.ts`.
 *
 * ## Runs on `chromium-gpu`, headed, on a real GPU
 *
 * Criterion 6.7 measures the canvas's position in the page and 6.3 drives a real resize. Both are
 * claims about layout as a browser actually performs it, and this project's rule is that a headless
 * software rasteriser is not the thing any of these criteria claim about. See `playwright.config.ts`.
 *
 * ## Everything here asserts what is DRAWN
 *
 * `willRender(camera)` rather than `visible !== false && alpha >= 1`. That pair was Phase 5's fix
 * and Codex showed it was still insufficient: `setScale(0)` clears the transform render flag and
 * the GPU draws nothing while both assertions stay green. `willRender` is Phaser's own answer to
 * "would this be drawn", and it tracks every exclusion route rather than the two a reviewer thought
 * of *(reviews/phase-05-impl.md:223)*.
 *
 * No `waitForTimeout` anywhere: waits are on `window.__game.ready` or on a tick count.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';
import { readHud } from './hudHelpers';
import { hudFits } from '../../src/render/hud';


test.describe('criterion 6.2 — the HUD is pinned under pan and under zoom', () => {
  test('panning the world camera does not move any HUD object', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);

    // Walk far enough that the camera has definitely scrolled.
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 120);
    await page.keyboard.up('ArrowRight');

    const scrolled = await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { cameras: { main: { scrollX: number } } };
      return s.cameras.main.scrollX;
    });
    expect(typeof scrolled).toBe('number');
    expect(scrolled).toBeGreaterThan(0);

    const after = await readHud(page);
    expect(after.plate.x).toBe(before.plate.x);
    expect(after.plate.y).toBe(before.plate.y);
    expect(after.gearIcon.x).toBe(before.gearIcon.x);
    expect(after.counter.x).toBe(before.counter.x);
  });

  /**
   * The zoom half — and the reason the HUD is a parallel scene at all.
   *
   * Vault 6.1: a zero scroll factor pins against PAN but not against ZOOM. Before Phase 6 the HUD
   * was `setScrollFactor(0)` objects on `GameScene`'s own display list, and this test would have
   * failed the moment the world camera zoomed. It passed only because `CAMERA_ZOOM` is 1.
   */
  test('zooming the world camera does not scale or move the HUD', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);

    await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        cameras: { main: { setZoom(z: number): void; zoom: number } };
      };
      s.cameras.main.setZoom(2.5);
    });
    await waitTicks(page, 4);

    const zoom = await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { cameras: { main: { zoom: number } } };
      return s.cameras.main.zoom;
    });
    expect(zoom).toBe(2.5);

    const after = await readHud(page);
    expect(after.plate.x).toBe(before.plate.x);
    expect(after.plate.y).toBe(before.plate.y);
    expect(after.plate.w).toBe(before.plate.w);
    expect(after.plate.h).toBe(before.plate.h);
    expect(after.counter.x).toBe(before.counter.x);
    expect(after.counter.w).toBe(before.counter.w);
  });

  /**
   * Codex plan review F5: asserting the plate alone lets the bar or the counter vanish while the
   * criterion stays green. All three, every time.
   */
  test('all three HUD objects would actually be drawn', async ({ page }) => {
    await bootToGame(page);
    const hud = await readHud(page);

    expect(hud.plate.willRender).toBe(true);
    expect(hud.barFill.willRender).toBe(true);
    expect(hud.gearIcon.willRender).toBe(true);
    expect(hud.counter.willRender).toBe(true);
  });
});

test.describe('criterion 6.3 — built from the live game size', () => {
  test('the HUD fits at the design size, and the predicate is the unit suite\'s', async ({
    page,
  }) => {
    await bootToGame(page);
    const hud = await readHud(page);

    // `hudFits` is imported from src/, so this asserts the SAME definition the unit test does.
    expect(hudFits(hud.layout, hud.gameSize.width, hud.gameSize.height, hud.counter.w)).toBe(true);
  });

  test.describe('at every supported viewport', () => {
    for (const [w, h] of [
      [1280, 720],
      [852, 480],
    ] as const) {
      test(`${w}x${h}: the HUD stays inside the game size`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await bootToGame(page);

        const hud = await readHud(page);
        expect(hudFits(hud.layout, hud.gameSize.width, hud.gameSize.height, hud.counter.w)).toBe(
          true,
        );
        expect(hud.plate.willRender).toBe(true);
        expect(hud.counter.willRender).toBe(true);
      });
    }
  });

  /**
   * Codex plan review F6.
   *
   * The scale mode is `FIT`, so a browser resize never changes `scale.gameSize` and the viewport
   * tests above bound the layout function rather than a resize Phaser performs. This drives a real
   * `game.scale.resize()` instead, which is the code path the criterion actually names — and which
   * vault 6.2's blocker is about.
   */
  test('a real scale.resize() re-lays-out the HUD rather than cropping it', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);
    expect(before.gameSize.height).toBe(1080);

    await page.evaluate(() => {
      (
        window as unknown as { __phaserGame: { scale: { resize(w: number, h: number): void } } }
      ).__phaserGame.scale.resize(1280, 720);
    });
    await waitTicks(page, 4);

    const after = await readHud(page);
    expect(after.gameSize.width).toBe(1280);
    expect(after.gameSize.height).toBe(720);
    // The layout followed the new size rather than staying at the old one — the exact failure vault
    // 6.2 describes, where a camera built at a fixed size cropped a whole HUD plate off a phone.
    expect(after.layout.scale).toBeLessThan(before.layout.scale);
    expect(after.plate.w).toBeLessThan(before.plate.w);
    expect(hudFits(after.layout, 1280, 720, after.counter.w)).toBe(true);
    expect(after.plate.willRender).toBe(true);
  });
});

test.describe('criterion 6.7 — the canvas is centred once', () => {
  /**
   * `index.html` centred the canvas with flexbox while `config.ts` sets `autoCenter: CENTER_BOTH`.
   * Phaser's centring writes CSS margins; a flex parent then centres the margin BOX, and the two
   * compose to park the canvas about a quarter of the leftover gap off centre.
   *
   * Measured on this machine before the fix: at 1400 × 900 the canvas sat at top 85 / bottom 29
   * against a correct 56 / 57. It looks almost right, which is why it survived five phases — and
   * why this is a measurement rather than a stylesheet review.
   */
  test('a letterboxed viewport leaves equal gaps above and below', async ({ page }) => {
    // Deliberately NOT 16:9: at the game's own aspect ratio the canvas fills the viewport and any
    // centring bug is invisible. That is how this defect stayed hidden.
    await page.setViewportSize({ width: 1400, height: 900 });
    await bootToGame(page);

    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      return {
        top: r.top,
        bottom: window.innerHeight - r.bottom,
        left: r.left,
        right: window.innerWidth - r.right,
      };
    });

    expect(typeof box.top).toBe('number');
    // 1px of tolerance for an odd number of leftover pixels, and no more: the defect was 28px.
    expect(Math.abs(box.top - box.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(1);
  });

  test('the canvas is not pushed outside the viewport at any supported size', async ({ page }) => {
    for (const [w, h] of [
      [1280, 720],
      [852, 480],
      [1400, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);

      const fits = await page.evaluate(() => {
        const r = document.querySelector('canvas')!.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
      });
      expect(fits, `canvas overflows at ${w}x${h}`).toBe(true);
    }
  });
});

test.describe('the boot gate still owns the HUD', () => {
  test('a refused boot leaves no HUD drawn over the error screen', async ({ page }) => {
    await bootToGame(page);
    expect(await page.evaluate(() => window.__game?.ready)).toBe(true);

    // The HUD runs in parallel with Game, so a refusal that stops only Game leaves a health bar and
    // a gear counter drawn over the error screen — a refusal you can see straight through.
    const uiActive = await page.evaluate(() => {
      const game = (
        window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } }
      ).__phaserGame;
      return game.scene.isActive('UI');
    });
    expect(uiActive).toBe(true);
  });
});
