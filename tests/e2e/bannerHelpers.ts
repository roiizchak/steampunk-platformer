/**
 * The controls banner, read out of the running game.
 *
 * A file of its own rather than three more functions in `hudHelpers.ts`, which is at 352 lines
 * against a 400-line ceiling — the same seam that split `phase-06-hud.spec.ts` in Phase 6.
 *
 * Everything here reaches through `window.__phaserGame`, which is **dev-only**. That is the whole
 * reason the production half of this criterion is a pixel assertion in
 * `phase-10-production.spec.ts` instead: `dist/` deliberately ships no debug surface, so there is
 * no object to ask.
 */

import { expect } from '@playwright/test';

type Page = import('@playwright/test').Page;

export interface BannerProbe {
  /** Did the scene hold a banner at all? The whole point: it used to be discarded on creation. */
  exists: boolean;
  text: string;
  /** Rows the browser's own `measureText()` produced — never a number this suite declared. */
  lines: number;
  /**
   * The rows themselves, so a review can see WHERE the legend broke.
   *
   * Added after the accessibility gate owner (brief 2, finding 1) predicted that a key and its
   * label would be split across rows in the narrower band — e.g. `[ ]` on one row and `volume` on
   * the next. That is a claim about the actual break points, and it is only answerable by printing
   * them.
   */
  rows: string[];
  /**
   * SCREEN-space bounds — `getBounds()` shifted by the owning camera's position.
   *
   * 🔴 `getBounds()` answers in the object's own space, and the banner's object x is deliberately
   * NOT where it draws: `helpBannerLayer.ts` places it at `layout.x - camera.x` because
   * `gameEffects.ts` moves `GameScene`'s camera to `(-margin.x, -margin.y)` so a screen shake never
   * uncovers the edge of the view. A `setScrollFactor(0)` object therefore draws `camera.x` to the
   * LEFT of its own x — about 10 px — while every limit this spec compares against (`gameSize`, the
   * HUD margin, the counter on `UIScene`'s camera at the origin) is screen space.
   *
   * Comparing the two spaces made the right-margin assertion fail by 1.33 px at 1280x720 on a
   * banner that was drawing exactly where it should, and made the left and top assertions 10 px
   * lenient in the other direction. Converted here, once, so no caller can forget.
   */
  bounds: { left: number; right: number; top: number; bottom: number };
  willRender: boolean;
  fontSize: string;
  gameSize: { width: number; height: number };
}

/**
 * Wait until the banner has been laid out, then read it.
 *
 * 🔴 `__game.ready` is not enough, for the reason `waitForHud` gives one file over: the HUD is a
 * QUEUED parallel scene, so at the instant `ready` flips the counter does not exist — and the
 * banner's first layout is deliberately deferred until it does. Waiting on `x > 0` waits on the
 * layout itself rather than on a frame count that happens to be long enough.
 */
export async function readBanner(page: Page): Promise<BannerProbe> {
  await page.waitForFunction(
    () => {
      const game = (
        window as unknown as { __phaserGame?: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame;
      if (!game) return false;
      const key = (window as unknown as { __game?: { sceneKey?: string } }).__game?.sceneKey;
      if (!key) return false;
      const scene = game.scene.getScene(key) as unknown as {
        banner?: { object(): { x: number } | null };
      };
      const obj = scene?.banner?.object?.();
      return obj != null && obj.x > 0;
    },
    undefined,
    { timeout: 20_000 },
  );

  const probe = await page.evaluate(() => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scale: { gameSize: { width: number; height: number } };
          scene: { getScene(k: string): unknown };
        };
      }
    ).__phaserGame;
    const key = (window as unknown as { __game: { sceneKey: string } }).__game.sceneKey;
    const scene = game.scene.getScene(key) as unknown as {
      cameras: { main: { x: number; y: number } };
      banner?: {
        object(): {
          text: string;
          style: { fontSize: string };
          getBounds(): { left: number; right: number; top: number; bottom: number };
          getWrappedText(): string[];
          willRender(c: unknown): boolean;
        } | null;
      };
    };
    const obj = scene.banner?.object?.() ?? null;
    if (obj === null) {
      return {
        exists: false,
        text: '',
        lines: 0,
        rows: [],
        bounds: { left: 0, right: 0, top: 0, bottom: 0 },
        willRender: false,
        fontSize: '',
        gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
      };
    }
    const b = obj.getBounds();
    const cam = scene.cameras.main;
    const wrapped = obj.getWrappedText();
    return {
      exists: true,
      text: obj.text,
      lines: wrapped.length,
      rows: wrapped,
      bounds: {
        left: b.left + cam.x,
        right: b.right + cam.x,
        top: b.top + cam.y,
        bottom: b.bottom + cam.y,
      },
      willRender: obj.willRender(scene.cameras.main),
      fontSize: obj.style.fontSize,
      gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
    };
  });

  // Type before value (vault C1). A probe that silently returned undefined would make every
  // comparison in the spec pass on `undefined === undefined`.
  expect(typeof probe.exists).toBe('boolean');
  expect(typeof probe.bounds.left).toBe('number');
  expect(typeof probe.lines).toBe('number');
  expect(typeof probe.text).toBe('string');
  return probe;
}
