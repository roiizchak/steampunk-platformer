import Phaser from 'phaser';
import { TILE_SIZE } from '../game/constants';
import type { LevelData } from '../game/tilemap';
import {
  TILESET_FIRST_GID,
  TILESET_TILE_COUNT,
  groundTileGid,
  hasSolidAbove,
  isGreyboxFill,
} from '../render/groundTiles';
import type { Rect } from '../sim/types';

/**
 * Draw the level's tile layer. Split out of `GameScene.ts` to keep that file under the 400-line
 * rule — this is scene-Phaser plumbing (`this.make`, `this.add`), not a decision, and nothing in
 * it is overridden by `ElementEditorScene` or `PlaygroundScene`.
 *
 * **CPU `TilemapLayer`, not `TilemapGPULayer`.** The game runs `Phaser.AUTO` with a live Canvas
 * fallback, and the GPU layer is WebGL-only: `TilemapGPULayerRender.js` installs a no-op Canvas
 * renderer, so on a Canvas fallback the entire level would draw nothing while every collision
 * test stayed green. Same reasoning ENGINE-NOTES.md already records for tint.
 *
 * The tile layer is ART. Collision came from the object layer, and the two are authored to
 * agree — proving they still agree is what the drawn-tile assertions in the Phase 3 e2e spec
 * are for, and making them disagree is what the Element Editor is for.
 */
export function drawLevelLayer(
  scene: Phaser.Scene,
  level: LevelData,
  levelKey: string,
): Phaser.Tilemaps.TilemapLayer {
  const map = scene.make.tilemap({ key: levelKey });

  /**
   * Resolved by POSITION, not by name.
   *
   * This used to hardcode `addTilesetImage('greybox', ...)` and `createLayer('ground', ...)`,
   * which both the code-reviewer gate owner and Codex flagged, and the consequence was worse
   * than the vault 3.3 style violation: `describeLevelProblem` never reads layer or tileset
   * names, so a level with a renamed layer PASSED the boot gate and then threw here — leaving
   * `ready` false with `bootError` null, which is the third state (a hang) that the whole
   * refuse-to-route design exists to make impossible.
   *
   * Taking the first tileset and the first tile layer is data-driven, so a rename cannot break
   * it, and it matches what `parseLevel` does — it reads every tile layer and never a name.
   */
  const tilesetName = (map.tilesets[0] as { name?: string } | undefined)?.name;
  if (!tilesetName) {
    throw new Error(`GameScene: level ${level.id} declares no tileset`);
  }
  const tileset = map.addTilesetImage(tilesetName, 'tiles-industrial', TILE_SIZE, TILE_SIZE);
  if (!tileset) {
    // Returns null with only a console warning. Silently drawing nothing is precisely the
    // failure this scene must not have.
    throw new Error(`GameScene: tileset "${tilesetName}" could not be bound in level ${level.id}`);
  }

  /**
   * **`addTilesetImage`'s `gid` argument does nothing here, and relying on it cost a defect.**
   *
   * The `.tmj` already declares this tileset, so Phaser finds it by name, calls `setImage` and
   * returns early — `firstgid` keeps whatever the level file said, and the `gid` argument is
   * only ever read on the branch that CONSTRUCTS a tileset. An earlier version passed `1` here
   * and read it back as if it had been applied.
   *
   * `setImage` does recompute `total` from the texture, so the 4x4 packed sheet becomes 16 tiles
   * even though the grey-box `.tmj` declares `tilecount: 1`. That is what makes the extra tiles
   * reachable at all — and it is also why the two facts `groundTiles.ts` indexes against are
   * asserted here rather than assumed. Phaser draws NOTHING for a gid outside the tileset, with
   * no warning at draw time, so a mismatch is invisible until someone looks at the floor.
   */
  const bound = tileset as unknown as { firstgid: number; total: number };
  if (bound.firstgid !== TILESET_FIRST_GID || bound.total !== TILESET_TILE_COUNT) {
    throw new Error(
      `GameScene: tileset "${tilesetName}" bound as firstgid ${bound.firstgid} with ` +
        `${bound.total} tiles; src/render/groundTiles.ts indexes ${TILESET_TILE_COUNT} tiles ` +
        `from firstgid ${TILESET_FIRST_GID}. Every ground tile would be the wrong one.`,
    );
  }

  const layerName = map.layers[0]?.name;
  if (layerName === undefined) {
    throw new Error(`GameScene: level ${level.id} has no tile layer`);
  }
  const layer = map.createLayer(layerName, tileset, 0, 0);
  if (!layer) {
    throw new Error(`GameScene: tile layer "${layerName}" could not be created in ${level.id}`);
  }
  // `createLayer` is typed `TilemapLayer | TilemapGPULayer` whatever the `gpu` argument is, so
  // the CPU choice is asserted at runtime rather than cast away. If a later edit passes
  // `gpu: true` this throws instead of silently drawing nothing on the Canvas fallback.
  if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
    throw new Error('GameScene: expected a CPU TilemapLayer; the GPU layer has no Canvas fallback');
  }
  applySurfaceTiles(layer, level.solids);
  return layer;
}

/**
 * Give the tile layer a brass-capped TOP and plain masonry beneath it.
 *
 * The rule and the two GIDs live in `src/render/groundTiles.ts`, engine-free, so
 * `tests/unit/ground-tiles.test.ts` can check them against the pixels of the shipped sheet.
 * They were scene-local literals until both turned out to be wrong — see that file's header.
 *
 * **`tile.index` is a GID.** `groundTileGid` returns one; do not put a local sheet index here.
 *
 * **"Buried" is decided from the SOLIDS, not from the tile layer.** It used to read
 * `layer.getTileAt(tile.x, tile.y - 1)` — *is any tile drawn above me* — while calling the answer
 * `hasSolidAbove`. Decoration standing on the floor therefore buried the floor: the spike run at
 * row 19 cost the ground beneath it its brass cap across four tiles, and that edge is the only
 * thing STYLE.md §5 RULE ONE lets a player read as "floor". Solidity comes from the object layer
 * *(vault 3.3)*, so that is what the question has to be asked of.
 *
 * This also retires the old mutation-during-iteration note. That note argued the loop was safe
 * *because* `getTileAt` could only be asked whether a tile was present, never which one. The
 * predicate no longer reads the layer at all, so the loop's rewrites cannot influence its own
 * answers — the hazard the note was managing does not exist any more.
 */
function applySurfaceTiles(layer: Phaser.Tilemaps.TilemapLayer, solids: readonly Rect[]): void {
  layer.forEachTile((tile) => {
    // Authored art is left exactly as the level file wrote it. Only the grey-box fill is the
    // rule's to reinterpret — see `GREYBOX_FILL_GID`.
    if (tile.index < 0 || !isGreyboxFill(tile.index)) {
      return;
    }
    tile.index = groundTileGid(hasSolidAbove(solids, tile.x, tile.y));
  });
}
