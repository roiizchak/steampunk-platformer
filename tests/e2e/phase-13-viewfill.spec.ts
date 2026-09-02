/**
 * **The view fills the screen end to end, and every consumer follows it.**
 *
 * The owner reported black bars left and right in fullscreen on a phone. A fixed 16:9 view scaled
 * by height into a ~19.5:9 viewport left **17.9 %** of the width black. `src/game/viewSize.ts`
 * gives the view the viewport's own aspect at a fixed `GAME_HEIGHT`, clamped into
 * `[GAME_WIDTH, MAX_GAME_WIDTH]`, so `Phaser.Scale.FIT` has nothing left to letterbox.
 *
 * ## Why a LIVE resize, and not just a fresh boot at each size
 *
 * Every consumer this change touched is correct on the first frame either way — the defects are all
 * in what happens on the SECOND size. `CameraManager.onResize` skips the shake camera (it is
 * deliberately oversized and at a negative offset, and Phaser only re-sizes cameras at `(0,0)`
 * matching the previous game size), the parallax `TileSprite`s hold their construction width, and
 * `attachTapRoutes` builds its zones once. A spec that boots fresh at 2400 px sees none of that.
 * So this file boots at one size and RESIZES, which is what a rotation and a fullscreen toggle
 * actually do.
 *
 * ## Read independently, never from one number
 *
 * Backing store, camera and parallax coverage are each measured from their own object.
 * Deriving them from a single `gameSize` read would let one stale consumer hide behind a correct
 * one — which is the whole failure mode here.
 *
 * The hit zones are the fourth consumer and they are NOT here: they are drawn only on a touch
 * device, so they live in `phase-13-viewfill-touch.spec.ts`, which runs in `chromium-touch`.
 */

import { expect, test } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH } from '../../src/game/constants';
import { bootToGame } from './gameHarness';

/** Everything the resize must move, read from the live objects rather than from the scale manager. */
async function readScene(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame!;
    const canvas = document.querySelector('canvas')!;
    const scene = g.scene.getScene('Game') as Phaser.Scene | null;
    const cam = scene?.cameras?.main;
    // The parallax layers are the only `TileSprite`s on the display list.
    const tiles = (scene?.children?.list ?? []).filter(
      (o) => (o as { type?: string }).type === 'TileSprite',
    ) as unknown as { width: number; height: number }[];
    return {
      backing: { w: canvas.width, h: canvas.height },
      css: { w: canvas.getBoundingClientRect().width, h: canvas.getBoundingClientRect().height },
      game: { w: g.scale.gameSize.width, h: g.scale.gameSize.height },
      camera: cam ? { w: cam.width, h: cam.height } : null,
      tiles: tiles.map((t) => ({ w: t.width, h: t.height })),
    };
  });
}

test.describe('the view fills the screen, and every consumer follows a live resize', () => {
  test('a widened viewport grows the backing store, the camera and the parallax together', async ({
    page,
  }) => {
    // EXACTLY 16:9. 900x506 is 1.779 and yields a 1921 px view — close enough to look right and
    // wrong enough to fail an equality, which is how this assertion earned its exact numbers.
    await page.setViewportSize({ width: 1024, height: 576 });
    await bootToGame(page);
    const before = await readScene(page);

    expect(before.backing.w, 'a 16:9 viewport should sit at the design width').toBe(GAME_WIDTH);
    expect(before.tiles.length, 'no parallax layers found — this spec would prove nothing').toBe(3);
    expect(before.camera, 'no main camera on the Game scene').not.toBeNull();

    // EXACTLY 20:9 (2.2222), a landscape phone's aspect, inside the 2.37 ceiling. 1024x461 was
    // here first and is 2.2213, which rounds the view to 2399 — near enough to read as 2400 and
    // wrong enough to fail an equality, which is how these viewports earned their exact numbers.
    await page.setViewportSize({ width: 1000, height: 450 });
    await expect
      .poll(async () => (await readScene(page)).backing.w, {
        message: 'the backing store never widened after the resize',
      })
      .toBeGreaterThan(GAME_WIDTH);
    const after = await readScene(page);

    // 1. The view itself.
    expect(after.game.h, 'the height clamp let the view grow vertically').toBe(GAME_HEIGHT);
    expect(after.game.w).toBeLessThanOrEqual(MAX_GAME_WIDTH);
    expect(
      Math.abs(after.css.w - 1000),
      'the canvas does not fill the viewport width — the black bars are still there',
    ).toBeLessThanOrEqual(1);

    // 2. The shake camera. Phaser will not re-size this one; `effectsCamera.ts` must.
    expect(
      after.camera!.w,
      'the camera kept its old width — a band of raw background appears inside the canvas',
    ).toBeGreaterThan(before.camera!.w);
    expect(
      after.camera!.w,
      'the camera is narrower than the view it must cover',
    ).toBeGreaterThanOrEqual(after.game.w);

    // 3. The parallax. Left at 1920 it leaves the right of the sky drawn in bare background.
    for (const tile of after.tiles) {
      expect(tile.w, 'a parallax layer is narrower than the view — bare sky down the edge').toBe(
        after.game.w,
      );
    }
  });

  test('a viewport past the aspect ceiling clamps and pillarboxes, deliberately', async ({
    page,
  }) => {
    // 2.60, wider than MAX_GAME_WIDTH / GAME_HEIGHT = 2.37. The bound is stated, so it is tested:
    // otherwise the ceiling is a number nothing ever reaches.
    await page.setViewportSize({ width: 1040, height: 400 });
    await bootToGame(page);
    const s = await readScene(page);

    expect(s.game.w, 'the view grew past the stated ceiling').toBe(MAX_GAME_WIDTH);
    expect(s.game.h).toBe(GAME_HEIGHT);
    expect(
      s.css.w,
      'past the ceiling the canvas is expected to pillarbox rather than stretch',
    ).toBeLessThan(1040);
  });
});
