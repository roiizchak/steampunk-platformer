/**
 * Which level `GameScene` plays, and the world that level makes. Phase 8.
 *
 * ## Why it left `GameScene`
 *
 * `GameScene.ts` is the file this project keeps pushing at the 400-line ceiling — the exemption
 * ratchet is at **zero**, and it stood at 395 before this phase added a level choice, a completion
 * branch and a menu key. `loadLevel` used to be five lines that took `catalog().levels[0]`; asking
 * *which* level is a real question now, with a save file and an unlock rule behind it, and the answer
 * does not belong in the file whose actual job is the seam between real time and simulated time.
 *
 * The `LevelData` → `CreateWorldOptions` mapping came with it, because it is the same subject: this
 * file is "the level, and the world it makes", and every field in it is data straight off the parsed
 * `.tmj` rather than a scene constant.
 *
 * ## 🔴 Nothing here trusts `lastLevel`
 *
 * `resolveEntryLevel` does the deciding, and `src/sim/progress.ts` carries the two-paragraph account
 * of why: `lastLevel` is a user-editable string on the boot path, and it fails both by pointing at a
 * level that does not exist (which throws inside `create()` and leaves `ready:false` /
 * `bootError:null`, the hang `refuseToRoute` exists to prevent) and by pointing at a level that
 * exists but is locked (which gives the game away without any error at all).
 *
 * `pickLevel` is therefore total in the same way that function is: given a catalog Boot has already
 * validated, it returns a level, never a throw, unless the catalog itself is empty — which Boot
 * refuses to route on.
 */

import type Phaser from 'phaser';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';
import { RENDER_SCALE } from '../game/constants';
import { completedIds, readProgress, safeLocalStorage, writeProgress, type SettingsStorage } from '../game/save';
import { parseLevel, type LevelData } from '../game/tilemap';
import { resolveEntryLevel } from '../sim/progress';
import type { CreateWorldOptions } from '../sim/tick';

/** Seed for the sim's RNG. Fixed so an e2e run and a hands-on run are the same run *(vault 2.3)*. */
export const SIM_SEED = 20260806;

/**
 * The validated catalog. Boot refuses to route without one, so reaching here means it exists — this
 * throws rather than returning `undefined` because a silent `?.` is how a missing catalog becomes a
 * game with no audio and no complaint.
 */
export function assetCatalog(scene: Phaser.Scene): AssetCatalog {
  const catalog = scene.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
  if (!catalog) {
    throw new Error('GameScene: no asset catalog in cache; Boot should have refused to route');
  }
  return catalog;
}

/**
 * The level ids, in the order the catalog lists them — which IS the progression order.
 *
 * Read off `index.json` rather than sorted or parsed out of the names, so reordering the catalog
 * reorders the game *(vault 3.3)*. `progress.ts` never sees a level name; it only ever sees this
 * array.
 */
export function levelOrder(catalog: AssetCatalog): string[] {
  return catalog.levels.map((entry) => entry.key);
}

/** The first catalogued level. What the DEV scenes open, regardless of the save — see `startDevScene`. */
export function firstLevelId(scene: Phaser.Scene): string | undefined {
  return assetCatalog(scene).levels[0]?.key;
}

/**
 * Open the level menu — Phase 8's ESC, bound in `gameInput.ts`.
 *
 * 🔴 Guarded on the scene KEY, not on `playerInputEnabled`. `PlaygroundScene` and
 * `ElementEditorScene` both `extends GameScene`, so they inherit the binding — and Playground leaves
 * player input **on**, because walking around while sweeping a knob is the whole point of it, so that
 * flag would not stop it. `ElementEditor` turns input off, so that flag *would*. Neither answer is the
 * question being asked. `playerInputEnabled` is right for a key that drives the character; "am I the
 * production play scene" is right for a key that leaves it.
 */
export function openLevelSelect(scene: Phaser.Scene): void {
  if (scene.scene.key === 'Game') {
    scene.scene.start('LevelSelect');
  }
}

export interface PickedLevel {
  level: LevelData;
  /** The tilemap cache key, which `drawLevelLayer` and `ElementEditorScene` both need. */
  key: string;
}

/**
 * Decide which level to play, parse it, and hand back both it and its cache key.
 *
 * @param requested the id `GameScene.init(data)` was started with — from the level-select screen, from
 *   `gameComplete`'s "next level", or from `startDevScene`. `null` means "resume whatever the save
 *   says", which is the plain-boot path.
 *
 * The save is read here rather than passed in because this is the only place the *choice* is made, and
 * a caller that had to fetch progress first could forget to. `safeLocalStorage()` is what makes that
 * read safe on an origin that refuses storage — the `window.localStorage` **getter itself throws**
 * there, before any `try` inside `readProgress` is reached.
 */
export function pickLevel(
  scene: Phaser.Scene,
  requested: string | null,
  /**
   * Injectable so the boot path is a unit test rather than a browser round trip. Defaulted rather
   * than required because there is exactly one production caller and making it name the storage would
   * be a second place that has to know the `window.localStorage` getter can throw.
   *
   * Only `Phaser.Scene` is imported as a TYPE in this file, so with the storage injected the whole
   * module evaluates with Phaser uninstalled — which is what lets `level-pick.test.ts` run under
   * `npm run test:sim-isolated` alongside the sim suite.
   */
  storage: SettingsStorage | null = safeLocalStorage(),
): PickedLevel {
  const catalog = assetCatalog(scene);
  const order = levelOrder(catalog);
  const save = readProgress(storage);
  const key = resolveEntryLevel(requested, save.lastLevel, order, completedIds(save));
  if (key === null) {
    throw new Error('GameScene: the catalog lists no levels; Boot should have refused to route');
  }

  /**
   * 🔴 The resume point is written when a level STARTS, not only when one finishes.
   *
   * `recordCompletion` sets `lastLevel` to the level just completed, which is the wrong thing to come
   * back to: finish level-01, start level-02, close the tab, and the save still says level-01 — the
   * player is sent back to a level they have already beaten. `progress.ts` says in as many words that
   * resuming means *the level you were last on*, and this is what makes that true.
   *
   * ⚠️ Gated on the scene key, and for the same reason `openLevelSelect` is: `PlaygroundScene` and
   * `ElementEditorScene` both extend `GameScene` and come through here with an explicit level id, so
   * without the guard opening a dev tool would rewrite the player's resume point.
   *
   * Skipped when it already matches, so an ordinary boot performs no write at all — which is what keeps
   * "a save appeared before anything was earned" false, and that distinction is what the unlock rule
   * depends on.
   */
  if (scene.scene.key === 'Game' && save.lastLevel !== key) {
    save.lastLevel = key;
    writeProgress(storage, save);
  }

  const cached = scene.cache.tilemap.get(key) as { data?: unknown } | undefined;
  return { level: parseLevel(key, cached?.data), key };
}

/**
 * Every world input, taken from the parsed level and nothing else.
 *
 * ⚠️ The rule this function exists to keep visible: **not one of these fields is a scene constant.**
 * Move an enemy, a spike, a gear or the exit in Tiled and it moves in the game; there is no
 * scene-side list to drift out of step with the file. `solids` has been plain data since Phase 2 and
 * the resolver in `src/sim/player.ts` has never known where it came from.
 *
 * `goal` is Phase 8's addition, and it is the same rectangle `goalLayer.drawGoal` draws — so the
 * doorway the player sees and the volume step 9d triggers on cannot disagree.
 */
export function worldOptionsFor(level: LevelData): CreateWorldOptions {
  return {
    seed: SIM_SEED,
    scale: RENDER_SCALE,
    solids: level.solids,
    spawn: level.spawn,
    bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
    hazards: level.hazards,
    enemies: level.enemies,
    gears: level.gears,
    goal: level.goal,
  };
}
