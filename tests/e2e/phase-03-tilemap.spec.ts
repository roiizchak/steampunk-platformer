/**
 * Phase 3 criteria 3.1, 3.2 and 3.4 — collision against the shipped level, and the camera.
 *
 * ## Two rules this file is built around
 *
 * **Sample in the page, once per animation frame, and assert on an aggregate.** A wait expressed
 * in ticks cannot bound a sampling window: `waitTicks(N)` guarantees *at least* N ticks, and under
 * parallel workers a single round trip has outlasted an entire 65-tick jump arc. That has produced
 * both a false green with a mutation applied and a false red on correct code, in this suite. Every
 * loop below therefore runs inside `page.evaluate` and returns a summary — including its own
 * sample count, so an empty loop cannot pass.
 *
 * **Assert against what was DRAWN, not only against the debug surface.** Codex plan review P4:
 * every position oracle here could otherwise come from the same collision data that drives the
 * sim, so all of it would pass with the tile layer missing or displaced — which is precisely the
 * art-versus-collision defect this phase's Element Editor exists for. So each collision test also
 * reaches through `window.__phaserGame` to the real `TilemapLayer` and asserts the drawn tile's
 * edge agrees with the collision strip. Phase 2 needed the identical seam (Codex I5) after
 * deleting `renderPlayer()` left the whole suite green.
 */

import { expect, test } from '@playwright/test';
import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { cameraSetup, tracksTarget, viewFits } from '../../src/render/cameraRig';
import { PLAYER_BOX } from '../../src/sim/player';
import type { Rect } from '../../src/sim/types';
import { BOOT_TIMEOUT, bootToGame, readPlayer, waitTicks } from './gameHarness';

const HALF_BODY = (PLAYER_BOX.w * RENDER_SCALE) / 2;

/**
 * The level, fetched over HTTP from the running dev server and parsed with the REAL parser.
 *
 * Deliberately not a copy of the numbers: this is the same file the browser loads, so an edit to
 * the level moves the expectations with it rather than turning six specs red.
 */
async function shippedLevel(page: import('@playwright/test').Page): Promise<LevelData> {
  const response = await page.request.get('/assets/levels/level-01.tmj');
  expect(response.ok(), 'the shipped level did not load over HTTP').toBe(true);
  return parseLevel('level-01', await response.json());
}

/** The strip the player spawns on, found by geometry rather than by authoring order. */
function groundAtSpawn(level: LevelData): Rect {
  const strip = level.solids.find(
    (s) => s.y === level.spawn.y && level.spawn.x > s.x && level.spawn.x < s.x + s.w,
  );
  expect(strip, 'no collision strip under the spawn point').toBeDefined();
  return strip!;
}

/** The first strip to the right of spawn that stands above the ground — the wall. */
function wallRightOfSpawn(level: LevelData): Rect {
  const candidates = level.solids
    .filter((s) => s.x > level.spawn.x && s.y < level.spawn.y)
    .sort((a, b) => a.x - b.x);
  expect(candidates.length, 'no wall to the right of spawn').toBeGreaterThan(0);
  return candidates[0]!;
}

/** The drawn tile at a world point, read off the real TilemapLayer. `null` if nothing is drawn. */
async function drawnTileAt(
  page: import('@playwright/test').Page,
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

test.describe('Phase 3 — tilemap collision and camera', () => {
  test('3.1 the player lands on the collision layer and never falls through it', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const ground = groundAtSpawn(level);

    await waitTicks(page, 15);
    const resting = await readPlayer(page);
    expect(resting.y).toBe(ground.y);
    expect(resting.vy).toBe(0);
    expect(resting.state).toBe('idle');

    // Standing still proves nothing about falling THROUGH. Jump, then watch the whole arc: the
    // deepest y ever observed must be the strip's top, never past it.
    await page.keyboard.down('Space');
    const arc = await page.evaluate(async () => {
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
    await page.keyboard.up('Space');

    expect(arc.samples).toBeGreaterThan(60);
    // It really left the ground, so the arc is a jump and not a stationary read.
    expect(ground.y - arc.highest).toBeGreaterThan(100);
    // And never sank below the surface at any sampled frame.
    expect(arc.lowest).toBe(ground.y);

    // Codex P4: everything above reads the same data the sim collides against, so it would all
    // pass with nothing drawn. The DRAWN tile under the player must have its top at the strip top.
    const tile = await drawnTileAt(page, resting.x, ground.y + 1);
    expect(tile, 'no tile is drawn where the player is standing').not.toBeNull();
    expect(tile!.pixelY).toBe(ground.y);
    expect(tile!.index).toBeGreaterThan(0);
  });

  test('3.2 the player cannot pass through a solid horizontally', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const wall = wallRightOfSpawn(level);

    await waitTicks(page, 10);
    await page.keyboard.down('ArrowRight');

    // Run until x stops changing, sampling per frame. The aggregate is the final x plus how many
    // consecutive frames it held — a player still creeping forward has not been stopped.
    const run = await page.evaluate(async () => {
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
    await page.keyboard.up('ArrowRight');

    expect(run.samples).toBeGreaterThan(200);
    expect(run.stableFrames).toBeGreaterThan(30);

    // Codex P5: `player.x` is the feet CENTRE, so a body stopped flush against the wall has its
    // centre half a body-width short of it. Asserting `=== wall.x` would bless 22px of the player
    // standing inside the wall.
    expect(run.finalX).toBe(wall.x - HALF_BODY);
    // It never got past that even for one frame, which a settled final position cannot show.
    expect(run.maxX).toBe(wall.x - HALF_BODY);

    // And the wall the player stopped against is actually drawn there (Codex P4).
    const tile = await drawnTileAt(page, wall.x + wall.w / 2, wall.y + wall.h / 2);
    expect(tile, 'no tile is drawn where the wall stopped the player').not.toBeNull();
    expect(tile!.pixelX).toBe(wall.x);
  });

  test('3.4 the camera follows the player and never shows outside the map', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const { bounds } = cameraSetup(level, 1920, 1080);

    await waitTicks(page, 10);
    await page.keyboard.down('ArrowRight');

    const track = await page.evaluate(async () => {
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
    await page.keyboard.up('ArrowRight');

    expect(track.views.length).toBeGreaterThan(100);

    // Never outside the map, on any sampled frame — asserted with the SAME predicate the unit
    // suite uses, so there is one definition of "inside the map" rather than two.
    const escaped = track.views.filter((v) => !viewFits(bounds, v));
    expect(escaped, `camera showed outside the map on ${escaped.length} frames`).toEqual([]);

    // It actually moved. A camera pinned at the origin satisfies containment trivially.
    expect(track.views[track.views.length - 1]!.x).toBeGreaterThan(track.views[0]!.x);

    // Codex P6: containment plus movement is satisfied by a scripted pan that ignores the player.
    // This is the claim the criterion actually makes — the player stays comfortably on screen.
    const lost = track.views.filter((v, i) => !tracksTarget(v, track.targets[i]!.x, track.targets[i]!.y, 200));
    expect(lost, `camera stopped tracking the player on ${lost.length} frames`).toEqual([]);
  });

  test('3.4 the camera stays inside the map at the left edge, where clamping is doing the work', async ({
    page,
  }) => {
    // The interesting half of `setBounds`: at spawn the player is far left, so the camera CANNOT
    // centre on it without showing past x=0. If bounds were dropped, this is what notices, and
    // the moving-right test above would not.
    await bootToGame(page);
    const level = await shippedLevel(page);
    const { bounds } = cameraSetup(level, 1920, 1080);

    await waitTicks(page, 10);
    const view = await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as {
        cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
      };
      const v = scene.cameras.main.worldView;
      return { x: v.x, y: v.y, w: v.width, h: v.height };
    });

    expect(typeof view.x).toBe('number');
    expect(viewFits(bounds, view)).toBe(true);
    expect(view.x).toBe(0);
    // Bottom-clamped too: the level is taller than the view and the player is near its floor.
    expect(view.y + view.h).toBe(bounds.h);
  });

  test('3.3 the shipped level is the one the game actually loaded', async ({ page }) => {
    // Ties the unit suite's shipped-data sweep to the running game. `tilemap-data.test.ts` proves
    // the file on disk is valid; this proves the browser loaded THAT file and nothing else.
    await bootToGame(page);
    const level = await shippedLevel(page);

    const view = await page.evaluate(() => window.__game);
    expect(view?.levelId).toBe(level.id);

    const drawn = await page.evaluate(() => {
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

    expect(drawn, 'no tilemap layer was added to the scene').not.toBeNull();
    expect(drawn!.w).toBe(level.widthPx);
    expect(drawn!.h).toBe(level.heightPx);
    expect(drawn!.total).toBe(level.widthTiles * level.heightTiles);
  });
});

test.describe('Phase 3 — the boot gate covers levels too', () => {
  test('3.3 a malformed level refuses to route, exactly like a corrupt image', async ({ page }) => {
    // The level equivalent of Phase 1's asset-refusal cases. Without this a 404'd or broken level
    // reaches GameScene and draws an empty world the player stands in — which reads as a broken
    // camera rather than a missing file, and is a clean boot as far as any other gate can tell.
    await page.route('**/assets/levels/level-01.tmj', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ width: 4, height: 4, tilewidth: 32, tileheight: 32, layers: [] }),
      }),
    );

    await page.goto('/');
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: BOOT_TIMEOUT },
    );

    const game = await page.evaluate(() => window.__game);
    expect(typeof game?.bootError).toBe('string');
    expect(game?.bootError).toContain('level-01');
    expect(game?.ready).toBe(false);
    expect(game?.sceneKey).toBe('Boot');
  });

  test('3.3 a level with no camera travel refuses to route (vault 3.2)', async ({ page }) => {
    // A level exactly the size of the viewport is structurally valid and completely unplayable as
    // a side-scroller. Vault 3.2 is a shipped game with 10px of scroll room, so this is the case
    // that must be loud rather than merely wrong.
    await page.route('**/assets/levels/level-01.tmj', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          width: 60,
          height: 34,
          tilewidth: 32,
          tileheight: 32,
          layers: [
            {
              type: 'tilelayer',
              name: 'ground',
              width: 60,
              height: 34,
              // A row of real tiles, not 2040 zeros. An all-empty tile layer is now rejected in
              // its own right ("draws nothing"), which would make this test pass for the wrong
              // reason — it is here to prove the CAMERA TRAVEL rule fires.
              data: [...new Array(1980).fill(0), ...new Array(60).fill(1)],
            },
            {
              type: 'objectgroup',
              name: 'collision',
              objects: [
                {
                  x: 0,
                  y: 1056,
                  width: 1920,
                  height: 32,
                  properties: [{ name: 'solid', type: 'bool', value: true }],
                },
                {
                  x: 96,
                  y: 1056,
                  width: 0,
                  height: 0,
                  point: true,
                  properties: [{ name: 'spawn', type: 'bool', value: true }],
                },
              ],
            },
          ],
        }),
      }),
    );

    await page.goto('/');
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: BOOT_TIMEOUT },
    );

    const game = await page.evaluate(() => window.__game);
    expect(typeof game?.bootError).toBe('string');
    expect(game?.bootError).toContain('camera travel');
    expect(game?.ready).toBe(false);
  });
});
