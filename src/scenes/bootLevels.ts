import type Phaser from 'phaser';
import { describeCatalogProblem, type AssetCatalog, type CatalogEntry } from '../game/assetCatalog';
import { GAME_HEIGHT, MAX_GAME_WIDTH } from '../game/constants';
import { describeLevelProblem, parseLevel } from '../game/tilemap';
import { cameraSetup } from '../render/cameraRig';

/**
 * The level half of BootScene's asset gate: queue every `.tmj` in the catalog, then verify each
 * one actually arrived and is loadable.
 *
 * **Split out of BootScene to keep it under the 400-line limit** — Phase 3's additions pushed it to
 * 428, which the `code-reviewer` gate owner caught against criterion 3.8. This is the same seam and
 * the same reason `assetCatalog.ts` was split out in Phase 1, one step further along: that file
 * took the pure validation, this one takes the Phaser-facing loading. It lives in `src/scenes/`
 * rather than `src/game/` deliberately — it touches the loader and the caches, and `src/scenes/` is
 * the only place Phaser is allowed to live.
 */

/**
 * Queue every level in the catalog.
 *
 * The cache is dropped first for the same reason the TextureManager is: a key already present
 * makes the loader silently skip the entry, after which an existence check passes for a file that
 * was never fetched. That is how a scene RESTART turned Phase 1's whole gate into a no-op, and
 * `phase-01-boot.spec.ts` has a test for it.
 */
export function queueLevels(scene: Phaser.Scene, levels: CatalogEntry[]): void {
  for (const entry of levels) {
    if (scene.cache.tilemap.exists(entry.key)) {
      scene.cache.tilemap.remove(entry.key);
    }

    scene.load.tilemapTiledJSON(entry.key, entry.url);
  }
}

/**
 * Run the REAL level parser over every loaded `.tmj`, so a malformed level refuses to route
 * exactly like a corrupt PNG does.
 *
 * Without this a 404'd or broken level reaches GameScene, which draws an empty world the player
 * stands in — a failure that reads as a broken camera, not a missing file. The parser is the one
 * the unit suite runs against the shipped bytes, so there is no second validator to drift.
 *
 * `cache.tilemap.get(key)` returns Phaser's `{ format, data }` wrapper and `data` is the raw Tiled
 * JSON, verified in `node_modules/phaser/src/loader/filetypes/TilemapJSONFile.js:52-57`.
 * `describeLevelProblem` refuses anything that is not a map object, so an unwrapped or
 * differently-shaped cache entry fails loudly here rather than silently downstream.
 */
export function verifyLevels(scene: Phaser.Scene, catalog: AssetCatalog | undefined): string[] {
  // The SAME guard `verifyExpectedTextures` and `verifySheets` carry, and it was missing here.
  //
  // `create()` collects problems and only then calls `refuseToRoute`, so a check that THROWS while
  // collecting means the refusal never happens: `ready:false` with `bootError:null`, the hang state
  // (vault 1.4). `Array.isArray(catalog.levels)` is not enough — `levels: [null]` IS an array, and
  // `entry.key` on the null entry throws. `describeCatalogProblem` already rejects a non-object
  // entry, so the catalog is being reported as the problem anyway; iterating it as well adds
  // nothing but a way to crash.
  //
  // Found by the Codex implementation review (finding 2) AFTER the same defect had been fixed in
  // `verifySheets` — the fix had been applied to the instance rather than to the class, which is
  // exactly the failure mode a second reviewer exists to catch.
  if (!catalog || describeCatalogProblem(catalog) || !Array.isArray(catalog.levels)) {
    return [];
  }

  const problems: string[] = [];

  for (const entry of catalog.levels) {
    const cached = scene.cache.tilemap.get(entry.key) as { data?: unknown } | undefined;
    if (!cached) {
      problems.push(`level "${entry.key}" (${entry.url}) is not in the tilemap cache`);
      continue;
    }

    const problem = describeLevelProblem(cached.data);
    if (problem) {
      problems.push(`level "${entry.key}" (${problem})`);
      continue;
    }

    // The camera contract is part of "this level is loadable": a level no larger than the view
    // cannot scroll, and vault 3.2 is the lesson that this is invisible until level design.
    try {
      // The widest view the game will draw — see the note at `gameCamera.ts`'s own call.
      cameraSetup(parseLevel(entry.key, cached.data), MAX_GAME_WIDTH, GAME_HEIGHT);
    } catch (error) {
      problems.push(`level "${entry.key}" (${String(error)})`);
    }
  }

  return problems;
}
