/**
 * The drawn tilemap — the catalog/texture agreement and criterion 4.22.
 *
 * Split out of `phase-04-assets.spec.ts` on 2026-08-15 to bring it under the 400-line rule
 * (criterion 4.16 / 5.12). These are the assertions that read DRAWN tile indices rather than
 * the pure predicate, which is the gap Lane A finding F1 opened.
 */
import { expect, test } from '@playwright/test';
import { BRICK_GID, SURFACE_GID } from '../../src/render/groundTiles';
import { TILE_SIZE } from '../../src/game/constants';
import { bootToGame } from './gameHarness';

/**
 * The lift profile and the catalog, fetched over HTTP from the running dev server.
 *
 * Fetched, not imported. Playwright runs these specs through Node's ESM loader, where a bare JSON
 * import needs an import attribute — but that is only the reason it cannot be an import, not the
 * reason it should be a fetch. The reason is vault 3.1: this way the spec asserts against the same
 * bytes the browser loads, and the failure mode where a config never reached the server shows up as
 * a red spec instead of as a green one reading the repo behind its back. Same idiom, same
 * rationale, as `phase-03-tilemap.spec.ts` fetching the shipped level.
 */
async function shippedJson<T>(
  page: import('@playwright/test').Page,
  url: string,
): Promise<T> {
  const response = await page.request.get(url);
  expect(response.ok(), `${url} did not load over HTTP`).toBe(true);
  return (await response.json()) as T;
}

test.describe('catalog and texture agree', () => {
  test('every sheet loaded into Phaser matches its catalog entry', async ({ page }) => {
    await bootToGame(page);
    const catalog = await shippedJson<{
      sheets: { key: string; frameWidth: number; frameHeight: number; frameCount: number }[];
    }>(page, '/assets/index.json');

    const actual = await page.evaluate(() => {
      const game = (
        window as unknown as {
          __phaserGame: {
            textures: { get(k: string): { getSourceImage(): { width: number; height: number } } };
            anims: { get(k: string): { frames: unknown[] } | undefined };
          };
        }
      ).__phaserGame;
      const keys = ['idle', 'walk', 'run', 'jump', 'fall'].map((a) => `brass-courier-${a}`);
      return keys.map((key) => {
        const source = game.textures.get(key).getSourceImage();
        return {
          key,
          width: source.width,
          height: source.height,
          animFrames: game.anims.get(key)?.frames.length ?? 0,
        };
      });
    });

    for (const entry of actual) {
      const declared = catalog.sheets.find((s) => s.key === entry.key);
      expect(declared, `${entry.key} is not in the catalog`).toBeDefined();
      // Type before value: a texture that failed to load returns a 1x1 placeholder, and comparing
      // it to a declared number would otherwise read as a dimension mismatch rather than a
      // missing asset.
      expect(typeof entry.width).toBe('number');
      expect(entry.height).toBe(declared!.frameHeight);
      expect(entry.width).toBe(declared!.frameWidth * declared!.frameCount);
      expect(entry.animFrames, `${entry.key} registered the wrong frame count`).toBe(
        declared!.frameCount,
      );
    }
  });
});


test.describe('4.22 — the brass cap survives non-solid decoration, ON THE DRAWN TILES', () => {
  /**
   * The predicate was already exhaustively unit-tested. **The call site was not**, and that is the
   * half that shipped broken.
   *
   * Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 1, finding F1, and confirmed by
   * mutation: reverting `GameScene.applySurfaceTiles` to the original
   * `groundTileGid(layer.getTileAt(tile.x, tile.y - 1) !== null)` leaves **all 464 unit tests
   * green**. `ground-tiles.test.ts` imports the pure function and never reads a drawn tile index,
   * and the nearest e2e assertion — `expect(tile.index).toBeGreaterThan(0)` — is satisfied by
   * BRICK_GID 9 exactly as happily as by SURFACE_GID 1.
   *
   * So the gate for criterion 4.22 could not see the defect criterion 4.22 exists for. This asserts
   * the drawn index itself, at the cells the spike run stands on.
   */
  async function drawnTileIndexAt(
    page: import('@playwright/test').Page,
    worldX: number,
    worldY: number,
  ): Promise<number | null> {
    return page.evaluate(
      ({ x, y }) => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: { getTileAtWorldXY?: unknown }[] };
        };
        const layer = scene.children.list.find(
          (o) => typeof (o as { getTileAtWorldXY?: unknown }).getTileAtWorldXY === 'function',
        ) as { getTileAtWorldXY(x: number, y: number): { index: number } | null } | undefined;
        const tile = layer?.getTileAtWorldXY(x, y);
        return tile ? tile.index : null;
      },
      { x: worldX, y: worldY },
    );
  }

  test('the ground under the spike run is capped, and the row below it is not', async ({ page }) => {
    await bootToGame(page);

    // Row 20 is the walking surface; the spike run is authored decoration standing on it at cols
    // 24-27. Those four cells are the ones that drew BRICK_GID before the fix — 384 px of walkable
    // floor with no brass leading edge, in a game whose art direction says a player identifies a
    // platform by that edge alone.
    const surfaceRow = 20 * TILE_SIZE + TILE_SIZE / 2;
    const belowRow = 21 * TILE_SIZE + TILE_SIZE / 2;

    for (const col of [24, 25, 26, 27]) {
      const x = col * TILE_SIZE + TILE_SIZE / 2;
      const capped = await drawnTileIndexAt(page, x, surfaceRow);
      // Type before value: a missing layer returns null, and comparing null to a gid would read as
      // a wrong tile rather than as a missing tilemap.
      expect(typeof capped, `no drawn tile at col ${col}, row 20`).toBe('number');
      expect(capped, `col ${col} lost its brass cap under the spikes`).toBe(SURFACE_GID);

      // And the row below is brick — which is what makes the assertion above a discrimination
      // rather than "every tile is SURFACE_GID".
      const buried = await drawnTileIndexAt(page, x, belowRow);
      expect(buried, `col ${col} row 21 should be brick, not surface`).toBe(BRICK_GID);
    }
  });

  test('a cell with solid ground directly above it is brick, not surface', async ({ page }) => {
    await bootToGame(page);

    // The pillar at x 3264-3360 stands on the ground from row 17 to 19, so the ground cell beneath
    // it at row 20 genuinely DOES have a solid above and must stay brick. Without this the test
    // above passes on a mutant that caps every tile unconditionally.
    const x = 3264 + TILE_SIZE / 2;
    const underPillar = await drawnTileIndexAt(page, x, 20 * TILE_SIZE + TILE_SIZE / 2);
    expect(typeof underPillar).toBe('number');
    expect(underPillar, 'the cell under the pillar should not be capped').toBe(BRICK_GID);
  });
});
