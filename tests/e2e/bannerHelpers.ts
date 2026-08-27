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
      cameras: { main: unknown };
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
        bounds: { left: 0, right: 0, top: 0, bottom: 0 },
        willRender: false,
        fontSize: '',
        gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
      };
    }
    const b = obj.getBounds();
    return {
      exists: true,
      text: obj.text,
      lines: obj.getWrappedText().length,
      bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
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
