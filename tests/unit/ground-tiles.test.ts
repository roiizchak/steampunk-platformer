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
  hasSolidAbove,
  isGreyboxFill,
  tileRect,
} from '../../src/render/groundTiles';
import { parseLevel } from '../../src/game/tilemap';
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

/**
 * `hasSolidAbove` — "buried" means a SOLID is above, not that a tile is drawn above.
 *
 * The shipped defect: the caller asked `layer.getTileAt(col, row - 1)` and called the answer
 * `hasSolidAbove`. Decoration standing on the floor therefore buried the floor. Measured on
 * `level-01`, the spike run at row 19, cols 24–27 cost the ground beneath it its brass cap across
 * 384 px — and by STYLE.md §5 RULE ONE that edge is the *only* thing that says "floor".
 *
 * These run against the SHIPPED level bytes, the same technique as `tilemap-data.test.ts` running
 * the real validator over the real file *(vault 3.1)*, plus synthetic fixtures for the two boundary
 * cases the real level does not happen to contain.
 */
describe('hasSolidAbove — solidity from the object layer, never the tile grid (vault 3.3)', () => {
  const level = parseLevel('level-01', shippedLevel());
  const T = level.tileHeight;
  const capped = (col: number, row: number) =>
    groundTileGid(hasSolidAbove(level.solids, col, row, T)) === SURFACE_GID;

  it('caps the ground under the spike run — the reported defect (4.22)', () => {
    // Row 19 cols 24-27 hold gid 13, the spikes, which carry NO collision rectangle. The ground
    // they stand on is row 20, and a player walks along it.
    for (let col = 24; col <= 27; col += 1) {
      expect(capped(col, 20)).toBe(true);
    }
  });

  it('caps every walkable top and buries everything under one', () => {
    expect(capped(5, 20)).toBe(true); // flat ground, left span
    expect(capped(80, 20)).toBe(true); // flat ground, right span
    expect(capped(5, 21)).toBe(false); // second ground row, buried by the first
    expect(capped(34, 17)).toBe(true); // pillar top
    expect(capped(34, 18)).toBe(false); // pillar, buried
    expect(capped(34, 19)).toBe(false); // pillar, buried
    expect(capped(50, 16)).toBe(true); // platform A
    expect(capped(58, 12)).toBe(true); // platform B
    expect(capped(66, 16)).toBe(true); // platform C
  });

  it('discriminates — it does not answer the same way everywhere (C2)', () => {
    // Without this, a predicate hardwired to `false` would satisfy every "is capped" line above.
    const answers = [capped(5, 20), capped(5, 21)];
    expect(new Set(answers).size).toBe(2);
  });

  it('is HALF-OPEN: a solid whose top edge touches the cell bottom does not bury it', () => {
    // The inclusive-overlap trap, and it inverts the whole level rather than one stretch. The
    // ground rect starts at y=1920; the row-19 cell spans y 1824..1920. Touching is not covering.
    const groundTop = 20 * T;
    const solids = [{ x: 0, y: groundTop, w: 10 * T, h: 2 * T }];
    expect(hasSolidAbove(solids, 5, 20)).toBe(false);
    expect(hasSolidAbove(solids, 5, 21)).toBe(true);
  });

  it('sees a sub-tile-nudged collision strip that genuinely overlaps', () => {
    // The Element Editor exists to nudge collision off the tile grid, so the predicate must not
    // assume alignment. One pixel of real overlap is a solid above; zero is not.
    const nudged = [{ x: 0, y: 20 * T - 1, w: 10 * T, h: T }];
    expect(hasSolidAbove(nudged, 5, 21)).toBe(true);
    const clearOfIt = [{ x: 0, y: 20 * T, w: 10 * T, h: T }];
    expect(hasSolidAbove(clearOfIt, 5, 20)).toBe(false);
  });

  it('ignores a solid that is beside the cell rather than above it', () => {
    const solids = [{ x: 20 * T, y: 19 * T, w: T, h: T }];
    expect(hasSolidAbove(solids, 5, 20)).toBe(false);
    expect(hasSolidAbove(solids, 20, 20)).toBe(true);
  });
});

describe('the surface rule reaches every shipped level (4.22)', () => {
  /**
   * `GameScene.applySurfaceTiles` rewrites a tile only when `isGreyboxFill(tile.index)` — i.e. only
   * `GREYBOX_FILL_GID`. That is deliberate: authored art must be left as the level file wrote it.
   *
   * **But it means the brass-cap rule is a silent no-op on any level whose ground is painted with a
   * different gid**, which is the normal outcome of editing a level in Tiled with some other brush
   * selected. Every ground row would draw whatever was painted, no cap anywhere, and STYLE.md
   * RULE ONE — *a player identifies a platform by that brass edge alone* — fails totally with
   * nothing red. The e2e assertions cannot see it either: they sample `level-01`, which is
   * generated.
   *
   * Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 2. Fixed here rather than in
   * the scene because throwing inside `GameScene.create()` would produce `ready:false` with
   * `bootError:null` — the hang state — and a boot-gate check is a bigger change than this phase
   * should make. A red unit test the day someone authors a level is the right place to find out.
   */
  for (const [path, raw] of Object.entries(LEVELS)) {
    const level = parseLevel(path, JSON.parse(raw));

    it(`${path.split('/').pop()}: the tile above every solid's top row is greybox fill`, () => {
      const tileLayer = (JSON.parse(raw) as {
        layers: { type?: string; data?: number[]; width?: number }[];
      }).layers.find((l) => l.type === 'tilelayer' && Array.isArray(l.data));
      expect(tileLayer, 'the level has no tile layer').toBeDefined();
      const data = tileLayer!.data!;
      const width = tileLayer!.width!;

      // The cells the rule is supposed to reinterpret: the top row of every solid rectangle.
      const notReinterpretable: string[] = [];
      for (const solid of level.solids) {
        const row = Math.floor(solid.y / TILE_SIZE);
        const from = Math.floor(solid.x / TILE_SIZE);
        const to = Math.floor((solid.x + solid.w - 1) / TILE_SIZE);
        for (let col = from; col <= to; col += 1) {
          const gid = data[row * width + col];
          // 0 is empty — a platform whose art is drawn by objects rather than tiles. Only a
          // NON-EMPTY, NON-greybox tile is the silent-no-op case.
          if (gid !== 0 && !isGreyboxFill(gid)) {
            notReinterpretable.push(`(${col},${row})=gid ${gid}`);
          }
        }
      }

      expect(
        notReinterpretable.slice(0, 8),
        'these ground cells carry authored art, so applySurfaceTiles skips them and they will ' +
          'NEVER receive a brass cap. Either paint the ground with the greybox fill gid, or ' +
          'change the surface rule — but do not ship a level whose floor has no leading edge.',
      ).toEqual([]);
    });
  }
});
