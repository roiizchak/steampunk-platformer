import { expect } from '@playwright/test';
import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { PLAYER_BOX } from '../../src/sim/player';
import type { Rect } from '../../src/sim/types';

type Page = import('@playwright/test').Page;

/**
 * Fixtures and page-driving helpers for phase-03-tilemap.spec.ts, extracted when that file crossed
 * 400 lines. DATA AND SETUP ONLY — every `test()`/`expect` verifying a criterion stays in the spec;
 * the sampling loops here return an aggregate for the spec to assert against, per this project's
 * "sample inside the page, once per animation frame" rule.
 *
 * Not named `*.test.ts` / `*.spec.ts` on purpose: `playwright.config.ts`'s `testDir` is
 * `./tests/e2e`, and Playwright's default `testMatch` collects any file in that tree whose name
 * contains `.test.` or `.spec.`. A helper collected as a spec becomes an empty test file. This
 * follows the same naming convention already in this directory (`gameHarness.ts`, `debugView.ts`).
 */

export const HALF_BODY = (PLAYER_BOX.w * RENDER_SCALE) / 2;

/**
 * The level, fetched over HTTP from the running dev server and parsed with the REAL parser.
 *
 * Deliberately not a copy of the numbers: this is the same file the browser loads, so an edit to
 * the level moves the expectations with it rather than turning six specs red.
 */
export async function shippedLevel(page: Page): Promise<LevelData> {
  const response = await page.request.get('/assets/levels/level-01.tmj');
  expect(response.ok(), 'the shipped level did not load over HTTP').toBe(true);
  return parseLevel('level-01', await response.json());
}

/** The strip the player spawns on, found by geometry rather than by authoring order. */
export function groundAtSpawn(level: LevelData): Rect {
  const strip = level.solids.find(
    (s) => s.y === level.spawn.y && level.spawn.x > s.x && level.spawn.x < s.x + s.w,
  );
  expect(strip, 'no collision strip under the spawn point').toBeDefined();
  return strip!;
}

/** The first strip to the right of spawn that stands above the ground — the wall. */
export function wallRightOfSpawn(level: LevelData): Rect {
  const candidates = level.solids
    .filter((s) => s.x > level.spawn.x && s.y < level.spawn.y)
    .sort((a, b) => a.x - b.x);
  expect(candidates.length, 'no wall to the right of spawn').toBeGreaterThan(0);
  return candidates[0]!;
}

/** The drawn tile at a world point, read off the real TilemapLayer. `null` if nothing is drawn. */
export async function drawnTileAt(
  page: Page,
  worldX: number,
  worldY: number,
): Promise<{ pixelX: number; pixelY: number; index: number } | null> {
  return page.evaluate(
    ({ x, y }) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        children: { list: { type?: string; getTileAtWorldXY?: unknown }[] };
      };
      const layer = scene.children.list.find(
        (o) => typeof (o as { getTileAtWorldXY?: unknown }).getTileAtWorldXY === 'function',
      ) as
        | { getTileAtWorldXY(x: number, y: number): { pixelX: number; pixelY: number; index: number } | null }
        | undefined;
      if (!layer) {
        return null;
      }
      const tile = layer.getTileAtWorldXY(x, y);
      return tile ? { pixelX: tile.pixelX, pixelY: tile.pixelY, index: tile.index } : null;
    },
    { x: worldX, y: worldY },
  );
}

/** Samples `window.__game.player.y` once per animation frame across a jump; returns the extremes. */
export function sampleJumpArc(page: Page): Promise<{ lowest: number; highest: number; samples: number }> {
  return page.evaluate(async () => {
    let lowest = Number.NEGATIVE_INFINITY;
    let highest = Number.POSITIVE_INFINITY;
    let samples = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const p = window.__game?.player as { y?: number } | null | undefined;
      if (typeof p?.y !== 'number') continue;
      samples += 1;
      lowest = Math.max(lowest, p.y);
      highest = Math.min(highest, p.y);
    }
    return { lowest, highest, samples };
  });
}

/** Samples `window.__game.player.x` once per animation frame while running; returns an aggregate. */
export function sampleHorizontalRun(
  page: Page,
): Promise<{ finalX: number; maxX: number; stableFrames: number; samples: number }> {
  return page.evaluate(async () => {
    let last = Number.NaN;
    let stableFrames = 0;
    let maxX = Number.NEGATIVE_INFINITY;
    let samples = 0;
    for (let frame = 0; frame < 400; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const p = window.__game?.player as { x?: number } | null | undefined;
      if (typeof p?.x !== 'number') continue;
      samples += 1;
      maxX = Math.max(maxX, p.x);
      stableFrames = p.x === last ? stableFrames + 1 : 0;
      last = p.x;
    }
    return { finalX: last, maxX, stableFrames, samples };
  });
}

/** Samples the camera's world view and the player's position once per animation frame. */
export function sampleCameraTrack(
  page: Page,
): Promise<{
  views: { x: number; y: number; w: number; h: number }[];
  targets: { x: number; y: number }[];
}> {
  return page.evaluate(async () => {
    const views: { x: number; y: number; w: number; h: number }[] = [];
    const targets: { x: number; y: number }[] = [];
    for (let frame = 0; frame < 200; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
      };
      const v = scene.cameras.main.worldView;
      const p = window.__game?.player as { x?: number; y?: number } | null | undefined;
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') continue;
      views.push({ x: v.x, y: v.y, w: v.width, h: v.height });
      targets.push({ x: p.x, y: p.y });
    }
    return { views, targets };
  });
}

export function readScrollY(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as { cameras: { main: { scrollY: number } } };
    return scene.cameras.main.scrollY;
  });
}

/** The lowest `scrollY` seen across 90 animation frames — used to show the camera rose. */
export function sampleLowestScrollY(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as { cameras: { main: { scrollY: number } } };
        let min = Number.POSITIVE_INFINITY;
        let frames = 0;
        const step = () => {
          min = Math.min(min, scene.cameras.main.scrollY);
          frames += 1;
          if (frames >= 90) {
            resolve(min);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

export function readCameraView(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    };
    const v = scene.cameras.main.worldView;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  });
}

/** Scrolls the camera directly to each far corner and reads back where Phaser's clamp landed it. */
export function readClampedCorners(
  page: Page,
): Promise<{
  bottomRight: { x: number; y: number; w: number; h: number };
  topLeft: { x: number; y: number; w: number; h: number };
}> {
  return page.evaluate(async () => {
    const camera = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      cameras: {
        main: {
          stopFollow(): void;
          setScroll(x: number, y: number): void;
          worldView: { x: number; y: number; width: number; height: number };
        };
      };
    };
    const main = camera.cameras.main;
    main.stopFollow();

    const read = async (x: number, y: number) => {
      main.setScroll(x, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const v = main.worldView;
      return { x: v.x, y: v.y, w: v.width, h: v.height };
    };

    // Far past every edge, in both directions. Phaser must clamp all four.
    return {
      bottomRight: await read(999_999, 999_999),
      topLeft: await read(-999_999, -999_999),
    };
  });
}

/** The drawn tilemap layer's own dimensions, read off the real `TilemapLayer`. */
export function readDrawnLayerStats(
  page: Page,
): Promise<{ w?: number; h?: number; total?: number } | null> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      children: { list: { width?: number; height?: number; tilesTotal?: number }[] };
    };
    const layer = scene.children.list.find(
      (o) => typeof (o as { tilesTotal?: number }).tilesTotal === 'number',
    );
    return layer ? { w: layer.width, h: layer.height, total: layer.tilesTotal } : null;
  });
}
