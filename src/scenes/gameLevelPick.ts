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
/**
 * The level menu's scene key, defined once.
 *
 * ⚠️ It was written out as a string literal in four places — `BootScene`'s two stop lists,
 * `openLevelSelect` below and the scene's own `super()` — while `gameComplete.ts` exported a constant
 * for it that none of them used. A scene key that four files spell independently is a rename waiting
 * to leave `refuseToRoute`'s stop list behind, which fails as a menu drawn over a booting game.
 */
export const LEVEL_SELECT_KEY = 'LevelSelect';

export function openLevelSelect(scene: Phaser.Scene): void {
  if (scene.scene.key === 'Game') {
    scene.scene.start(LEVEL_SELECT_KEY);
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
 * ⚠️ The rule this function exists to keep visible: **not one field describing the LEVEL is a scene
 * constant.** Move an enemy, a spike, a gear or the exit in Tiled and it moves in the game; there is
 * no scene-side list to drift out of step with the file. `solids` has been plain data since Phase 2
 * and the resolver in `src/sim/player.ts` has never known where it came from.
 *
 * `goal` is Phase 8's addition, and it is the same rectangle `goalLayer.drawGoal` draws — so the
 * doorway the player sees and the volume step 9d triggers on cannot disagree.
 *
 * 🔴 **`hitstopScale` is the one field that is NOT off the `.tmj`**, which is why the sentence above
 * now says "describing the level" rather than "not one of these fields". It is a DEV-only debug
 * multiplier and it is 1 in every build a player can run — see `hitstopScaleFromSearch` below.
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
    hitstopScale: hitstopScaleFromSearch(),
  };
}

/**
 * DEV ONLY — `?hitstop=N` scales every hit-stop freeze. 1 (unchanged) everywhere else.
 *
 * The shape is `src/game/audio.ts`'s `stallPerCue` verbatim: the production guard first, the query
 * read second, and both **at the point of use** so Vite folds the whole branch — and the
 * `URLSearchParams` reach with it — out of `dist/`. `tools/gen/verify-dist.mjs` is what proves the
 * fold actually happened.
 *
 * 🔴 **The read is HERE and not in `src/sim/`, and that is not a stylistic choice.** `src/sim/`
 * reaches no DOM at all (CLAUDE.md §3), so a freeze knob that parses `window.location` could not
 * live beside the freeze. What crosses the boundary is a plain number on `CreateWorldOptions`,
 * which is exactly what `World.hitstopScale`'s docstring asks for.
 *
 * Why it exists: `tests/e2e/phase-09-polish.spec.ts` asserts the player's body holds still for
 * exactly six ticks after a claw lands, and then runs the same driver again at `?hitstop=0` where
 * that plateau must be **absent**. Same page, same build, back to back — the committed fixture on
 * both sides of the threshold *(vault C2)*. Without arm B the plateau assertion is a description of
 * what the game happens to do, not a gate that can go red.
 *
 * Anything unparseable, negative, fractional or absent is 1. A debug flag that silently
 * half-applies is worse than one that is ignored, so the fallback is always "the shipped behaviour".
 *
 * 🔴 **`Number.isInteger` is a CORRECTNESS check, not an invariant kept for tidiness.** Two separate
 * things break on a fractional scale, and the second is the dangerous one:
 *
 *  1. `hitstopUntil` becomes a float duration inside `src/sim/`, against CLAUDE.md §3 — *every
 *     duration is an integer count of 60 Hz ticks*.
 *  2. **`?hitstop=1.5` makes `playerHurt` 6 × 1.5 = 9, which COLLIDES with `lethal`'s 9 in
 *     `IMPACT_BY_FREEZE`** (`gameEffects.ts`), the reverse lookup keyed on
 *     `hitstopUntil - lastHitTick`. That map's docstring rests on "the three lengths are distinct
 *     (4 / 9 / 6)"; a fractional scale is the first thing in this project that can break the
 *     premise, and the symptom is silent — taking a hit draws **lethal** sparks and arms a lethal
 *     shake, with nothing red anywhere.
 *
 * Enforced HERE, at the parse boundary, so the sim never sees a value it would have to re-check.
 *
 * ⚠️ The empty-string case needs its own line and `Number.isInteger` does not cover it: `Number('')`
 * is **0**, and `0` is an integer. `?hitstop=` would otherwise get the single most destructive
 * setting while this docstring promised the fallback is always the shipped behaviour.
 */
function hitstopScaleFromSearch(): number {
  if (!import.meta.env.DEV) {
    return 1;
  }
  const raw = new URLSearchParams(globalThis.location?.search ?? '').get('hitstop');
  if (raw === null || raw.trim() === '') {
    return 1;
  }
  const scale = Number(raw);
  return Number.isInteger(scale) && scale >= 0 ? scale : 1;
}
