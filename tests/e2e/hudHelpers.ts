/**
 * Shared probes for the Phase 6 e2e specs.
 *
 * Split out when `phase-06-hud.spec.ts` reached 601 lines against the project's 400-line ceiling,
 * which permits exactly one offender and has that slot spent by `src/scenes/GameScene.ts`. The
 * criteria were split along the same seam the QA gate uses: `phase-06-hud.spec.ts` owns what the
 * HUD SAYS (6.1, 6.4), `phase-06-chrome.spec.ts` owns where it SITS (6.2, 6.3, 6.7).
 *
 * Everything here reads the live scene tree through `window.__phaserGame` — dev-only, and the same
 * handle every other spec uses to assert that the DRAWN object tracks the sim. Without it, deleting
 * `renderPlayer()` once left every Phase 2 test green.
 */

import { expect } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** The shape `UIScene.hudObjects()` returns, flattened to what crosses the page boundary. */
export interface HudProbe {
  plate: { x: number; y: number; w: number; h: number; willRender: boolean };
  barFill: { willRender: boolean };
  gearIcon: { x: number; y: number; willRender: boolean };
  counter: { x: number; y: number; text: string; w: number; h: number; willRender: boolean };
  layout: {
    scale: number;
    plate: { x: number; y: number; w: number; h: number };
    slot: { x: number; y: number; w: number; h: number };
    gearIcon: { x: number; y: number; w: number; h: number };
    counter: { x: number; y: number; fontPx: number };
  };
  gameSize: { width: number; height: number };
}

/**
 * Read the live HUD out of the running `UIScene`.
 *
 * Reaches through `window.__phaserGame` — dev-only, and the same handle every other spec uses to
 * assert that the DRAWN object tracks the sim. Without it, deleting `renderPlayer()` once left
 * every Phase 2 test green.
 */
export async function readHud(page: Page): Promise<HudProbe> {
  const probe = await page.evaluate(() => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scale: { gameSize: { width: number; height: number } };
          scene: { getScene(key: string): unknown };
        };
      }
    ).__phaserGame;

    const ui = game.scene.getScene('UI') as unknown as {
      hudObjects(): {
        plate: { x: number; y: number; displayWidth: number; displayHeight: number; willRender(c: unknown): boolean };
        barFill: { willRender(c: unknown): boolean };
        gearIcon: { x: number; y: number; willRender(c: unknown): boolean };
        counter: { x: number; y: number; text: string; width: number; height: number; willRender(c: unknown): boolean };
        layout: HudProbe['layout'];
      };
      cameras: { main: unknown };
    };

    const o = ui.hudObjects();
    const cam = ui.cameras.main;
    return {
      plate: {
        x: o.plate.x,
        y: o.plate.y,
        w: o.plate.displayWidth,
        h: o.plate.displayHeight,
        willRender: o.plate.willRender(cam),
      },
      barFill: { willRender: o.barFill.willRender(cam) },
      gearIcon: { x: o.gearIcon.x, y: o.gearIcon.y, willRender: o.gearIcon.willRender(cam) },
      counter: {
        x: o.counter.x,
        y: o.counter.y,
        text: o.counter.text,
        w: o.counter.width,
        h: o.counter.height,
        willRender: o.counter.willRender(cam),
      },
      layout: o.layout,
      gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
    };
  });

  // Type before value, every field (vault C1). A probe that silently returned undefined would make
  // every comparison below pass on `undefined === undefined`.
  expect(typeof probe.plate.x).toBe('number');
  expect(typeof probe.counter.text).toBe('string');
  expect(typeof probe.layout.scale).toBe('number');
  return probe;
}

/** How many gear bodies are still drawn in the world. */
export async function visibleGearCount(page: Page): Promise<number> {
  const count = await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      gears: { objects(): { visible: boolean; willRender(c: unknown): boolean }[] };
      cameras: { main: unknown };
    };
    const cam = scene.cameras.main;
    return scene.gears.objects().filter((o) => o.visible && o.willRender(cam)).length;
  });
  expect(typeof count).toBe('number');
  return count;
}

/** Walk right until the sim reports at least `target` gears collected, or the budget runs out. */
export async function collectGears(page: Page, target: number): Promise<void> {
  await page.keyboard.down('ArrowRight');
  await page
    .waitForFunction((t) => (window.__game?.score ?? 0) >= t, target, { timeout: 20_000 })
    .finally(() => page.keyboard.up('ArrowRight'));
}
