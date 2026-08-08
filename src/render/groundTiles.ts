import { TILE_SIZE } from '../game/constants';

/**
 * Which tile of the industrial sheet each ground cell draws, engine-free *(vault 2.12)*.
 *
 * The shipped level was authored grey-box: its tile layer fills every solid cell with the same
 * gid, because Phase 3 only needed geometry. Drawing all of them with a brass-capped walkway tile
 * reads as a striped block — the brass leading edge repeating on every row — which is precisely
 * what STYLE.md §5 RULE ONE exists to prevent. The rule is *"a player identifies a platform by
 * that brass edge alone"*, and an edge on every row identifies nothing.
 *
 * So the tile is chosen from the NEIGHBOURHOOD rather than from the level data: a cell with
 * nothing above it is a walking surface and gets the brass cap, anything buried gets brick. The
 * level file is untouched, which matters because `tests/unit/tilemap-data.test.ts` pins its bytes
 * and its geometry.
 *
 * These numbers live here rather than inside the scene so `tests/unit/ground-tiles.test.ts` can
 * check them **against the pixels of the shipped sheet**. That is not ceremony: the first version
 * of this decision shipped with both constants wrong, and no test could see it because they were
 * scene-local literals. See the GID note below for what "wrong" meant.
 */

/**
 * **These are GIDs, not tileset-local indices.** The distinction is the whole reason this file
 * exists.
 *
 * Phaser resolves a tile through `Tileset.getTileTextureCoordinates`, which is
 * `texCoordinates[tileIndex - firstgid]` guarded by `containsTileIndex`. `level-01.tmj` declares
 * `firstgid: 1`, so the sheet's local tile *n* is gid *n + 1*, and gid 0 is not in the tileset at
 * all.
 *
 * Phase 4 first shipped `SURFACE = 0` and `BRICK = 8`, which are the LOCAL indices of the two
 * tiles that were wanted. What that actually drew:
 *
 * - gid 0 — `containsTileIndex(0)` is false, so the walking surface row drew **nothing**.
 * - gid 8 — local 7, a 33 %-opaque decorative tile with a brass bar across its middle, painted
 *   onto all eight buried rows. That bar, repeated per row, was the visible defect: an amber
 *   stripe on every row of the ground stack with the background showing through between them.
 *
 * Both were off by one in the same direction, and the result still looked like *a* floor, which is
 * why it survived until someone looked at it *(vault 4.24)*.
 */
export const SURFACE_GID = 1;
export const BRICK_GID = 9;

/** Tiles across and down the packed sheet — `tools/gen/build-world.mjs` packs 16 in a 4x4. */
export const TILESET_COLUMNS = 4;
export const TILESET_TILE_COUNT = 16;

/** The `firstgid` the shipped level declares, and the only one these GIDs are correct for. */
export const TILESET_FIRST_GID = 1;

/** Packed sheet dimensions implied by the above, in pixels. Asserted against the shipped file. */
export const TILESET_WIDTH = TILESET_COLUMNS * TILE_SIZE;
export const TILESET_HEIGHT = (TILESET_TILE_COUNT / TILESET_COLUMNS) * TILE_SIZE;

/**
 * The tile a ground cell draws, given whether a solid sits directly above it.
 *
 * One expression, but it is the single derivation point — the scene calls this rather than
 * carrying its own copy of the rule, so the test and the game cannot disagree about it.
 */
export function groundTileGid(hasSolidAbove: boolean): number {
  return hasSolidAbove ? BRICK_GID : SURFACE_GID;
}

/** Where a GID's tile sits in the packed sheet, in pixels. Throws on a GID outside the sheet. */
export function tileRect(gid: number): { x: number; y: number; w: number; h: number } {
  const local = gid - TILESET_FIRST_GID;
  if (local < 0 || local >= TILESET_TILE_COUNT) {
    throw new Error(
      `groundTiles: gid ${gid} is outside the tileset (firstgid ${TILESET_FIRST_GID}, ` +
        `${TILESET_TILE_COUNT} tiles). Phaser draws nothing for such a gid rather than throwing, ` +
        `which is how the Phase 4 off-by-one stayed invisible.`,
    );
  }
  return {
    x: (local % TILESET_COLUMNS) * TILE_SIZE,
    y: Math.floor(local / TILESET_COLUMNS) * TILE_SIZE,
    w: TILE_SIZE,
    h: TILE_SIZE,
  };
}
