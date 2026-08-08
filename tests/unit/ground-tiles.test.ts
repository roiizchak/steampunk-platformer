/**
 * The ground tiles, measured against the pixels of the shipped sheet.
 *
 * This suite exists because Phase 4 shipped both of its tile constants wrong and every gate in the
 * repository stayed green. `applySurfaceTiles` used tileset-LOCAL indices where Phaser wants GIDs,
 * and `level-01.tmj` declares `firstgid: 1`:
 *
 *   SURFACE = 0 -> `Tileset.containsTileIndex(0)` is false, so the walking surface drew NOTHING.
 *   BRICK   = 8 -> local 7, a 33%-opaque tile with a brass bar across its middle, painted onto
 *                  every buried row. Stacked, that bar reads as an amber stripe per row — the
 *                  exact "edge on every row identifies nothing" failure STYLE.md §5 RULE ONE
 *                  names, arrived at from the opposite direction.
 *
 * Nothing could see it. The level data was valid, the texture loaded, the layer created, the boot
 * gate passed, and the result still looked like *a* floor. It was found by looking *(vault 4.24)*.
 *
 * So the constants are checked **against the art they index**, not against themselves:
 *
 *   1. both GIDs are inside the tileset the shipped level declares;
 *   2. the SURFACE tile carries a brass leading edge along its TOP;
 *   3. the BRICK tile carries no warm colour at all.
 *
 * The fixture is the **shipped** `industrial.png` — the same technique as `tilemap-data.test.ts`
 * running the real validator over the real level bytes *(vault 3.1)*. A regenerated tileset whose
 * row order differs turns this suite red, which is correct: the GIDs are a claim about that file.
 */

import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../src/game/constants';
import {
  BRICK_GID,
  SURFACE_GID,
  TILESET_FIRST_GID,
  TILESET_HEIGHT,
  TILESET_TILE_COUNT,
  TILESET_WIDTH,
  groundTileGid,
  tileRect,
} from '../../src/render/groundTiles';
import { PASS, gateBrassCap } from '../../tools/gen/gates.mjs';
import { readPng } from '../../tools/gen/png.mjs';

const TILESET_PATH = 'public/assets/tiles/industrial.png';
const LEVEL_PATH = '../../public/assets/levels/level-01.tmj';

/** The shipped level, as text — the same `?raw` route every other suite uses for data files. */
const LEVELS = import.meta.glob('../../public/assets/levels/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface TiledTileset {
  firstgid: number;
  name: string;
}

function shippedLevel(): { tilesets: TiledTileset[] } {
  const raw = LEVELS[LEVEL_PATH];
  if (raw === undefined) {
    throw new Error(
      `ground-tiles: ${LEVEL_PATH} is not on disk. A declared input that cannot be found fails ` +
        `rather than being substituted (vault 4.16).`,
    );
  }
  return JSON.parse(raw) as { tilesets: TiledTileset[] };
}

const sheet = readPng(TILESET_PATH);

describe('the packed tileset matches what the GIDs assume about it', () => {
  it('is exactly the grid groundTiles.ts declares', () => {
    // Read off the file, never off a label (vault 4.11). If the sheet is regenerated at a
    // different size, every GID below indexes a different tile and the rest of this suite is
    // measuring the wrong thing — so this assertion runs first.
    expect({ width: sheet.width, height: sheet.height }).toEqual({
      width: TILESET_WIDTH,
      height: TILESET_HEIGHT,
    });
    expect((sheet.width / TILE_SIZE) * (sheet.height / TILE_SIZE)).toBe(TILESET_TILE_COUNT);
  });

  it('is indexed from the firstgid the shipped level actually declares', () => {
    // The constant that made both tiles wrong. `GameScene` passes a `gid` argument to
    // `addTilesetImage`, but that argument is IGNORED when the .tmj already declares the tileset —
    // Phaser takes an early return after `setImage`. The level file is the only authority here.
    const declared = shippedLevel().tilesets[0];
    expect(declared).toBeDefined();
    expect(declared.firstgid).toBe(TILESET_FIRST_GID);
  });

  it.each([
    ['SURFACE', SURFACE_GID],
    ['BRICK', BRICK_GID],
  ])('%s is a gid inside the tileset, not a local index', (_name, gid) => {
    // Phaser draws NOTHING for a gid outside the tileset — no throw, no warning at draw time.
    // `SURFACE = 0` was silently invisible for exactly this reason.
    expect(gid).toBeGreaterThanOrEqual(TILESET_FIRST_GID);
    expect(gid).toBeLessThan(TILESET_FIRST_GID + TILESET_TILE_COUNT);
    expect(() => tileRect(gid)).not.toThrow();
  });
});

describe('STYLE.md §5 RULE ONE, measured on the shipped tiles', () => {
  it('the SURFACE tile carries a brass leading edge along its top', () => {
    const verdict = gateBrassCap(sheet, 'capped', tileRect(SURFACE_GID));
    expect(verdict.status, verdict.reason).toBe(PASS);
    // Stated as numbers, not just a status, so a regeneration that erodes the cap is visible in
    // the failure message rather than only in a boolean.
    expect(verdict.value?.opaqueFraction).toBeGreaterThan(0.95);
    expect(verdict.value?.topShare).toBeGreaterThanOrEqual(0.8);
  });

  it('the BRICK tile carries no warm colour', () => {
    const verdict = gateBrassCap(sheet, 'plain', tileRect(BRICK_GID));
    expect(verdict.status, verdict.reason).toBe(PASS);
    expect(verdict.value?.opaqueFraction).toBeGreaterThan(0.95);
  });

  it('discriminates across the sheet rather than passing everything', () => {
    // The anti-vacuity check (C2). An earlier version of this pinned gid 8 — the tile the
    // off-by-one actually drew — as failing both ways. That was a fact about ONE generation of the
    // sheet, and regenerating the tileset silently turned it into an assertion about a different
    // tile. A property that survives regeneration is the right shape: the gate must SPLIT the
    // sheet, because one that answers PASS to everything would pass the two assertions above while
    // measuring nothing at all.
    const verdicts = Array.from({ length: TILESET_TILE_COUNT }, (_, local) =>
      gateBrassCap(sheet, 'capped', tileRect(TILESET_FIRST_GID + local)).status === PASS,
    );
    const capped = verdicts.filter(Boolean).length;
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThan(TILESET_TILE_COUNT);
  });
});

describe('the surface rule itself', () => {
  it('caps a cell with nothing above it and buries the rest', () => {
    expect(groundTileGid(false)).toBe(SURFACE_GID);
    expect(groundTileGid(true)).toBe(BRICK_GID);
    // The two must differ, or the rule is a no-op that still passes every tile-level check above.
    expect(SURFACE_GID).not.toBe(BRICK_GID);
  });

  it('refuses a gid outside the sheet instead of returning a silent rectangle', () => {
    expect(() => tileRect(0)).toThrow(/outside the tileset/);
    expect(() => tileRect(TILESET_FIRST_GID + TILESET_TILE_COUNT)).toThrow(/outside the tileset/);
  });
});
