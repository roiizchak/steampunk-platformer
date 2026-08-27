/**
 * **The dev-seam manifest — data, kept apart from the gate that reads it.**
 *
 * Split out of `devSeamGate.mjs` when that file crossed the 400-line rule, and the split is the one
 * the rule usually produces: a table of facts on one side, the logic that checks them on the other.
 * `manifestGaps()` stays with the gate because it is a decision; this is the record it decides
 * against, and it is the file a person edits when they add a dev seam.
 */

/**
 * 🔴 **WHICH sentinel lives in WHICH file — not how many exist.**
 *
 * This was `MIN_SENTINELS = 27`, a floor over a global count, and the Codex implementation review
 * broke it in one move. **The mutation was built and run, and it worked exactly as described:**
 *
 *   1. delete the `import.meta.env.DEV` guard in `globals.ts`'s `updateDebugState`, taking its
 *      `devSeam(...)` line with it;
 *   2. re-home that same token inside any OTHER already-guarded body.
 *
 * Result: census still 27, every token still unique, no `__DEVSEAM_` literal in the output — and
 * `Object.assign(state, patch)` **ships into every production tick**. `dev-seam gate ok: 27` and
 * `verify-dist ok` both printed. That is *the exact leak this gate was written to close*, the one
 * `verify-dist.mjs` has documented as invisible since 2026-08-23, passing the gate that claimed to
 * close it.
 *
 * The census was measuring the wrong thing. "27 sentinels exist somewhere" says nothing about
 * whether any of them is still inside the guard it names. So the gate now asserts the **exact
 * file → token map**, and a token's `<module>` segment must match its file's basename:
 *
 *   - **Deleting a guard** removes its token from its file's list → red, naming the file.
 *   - **Moving a token to another file** fails twice — the source file's list shrinks, and the
 *     destination's token no longer matches its basename.
 *   - **Adding a seam** is a deliberate edit here, which is the correct cost.
 *
 * ⚠️ **What it still cannot see, stated rather than implied:** moving a token between two guarded
 * bodies *in the same file* keeps the manifest satisfied. Closing that needs a parser proving each
 * sentinel is dominated by its own guard, and `@babel/parser` is approved **test-only** (CLAUDE.md
 * §3) — using it at build time would be a change to an approved decision, i.e. a STOP-and-ask. The
 * per-file map narrows the hole from "anywhere in `src/`" to "within one file", and the honest
 * report is that it is narrowed, not closed.
 */
/** @type {Record<string, string[]>} */
export const SENTINEL_MANIFEST = {
  'src/debug/globals.ts': [
    '__DEVSEAM_globals_installDebugGlobals__',
    '__DEVSEAM_globals_updateDebugState__',
  ],
  'src/game/audio.ts': ['__DEVSEAM_audio_cueStall__'],
  'src/game/config.ts': ['__DEVSEAM_config_devSceneRoster__'],
  'src/main.ts': ['__DEVSEAM_main_phaserGameHandle__'],
  'src/render/enemyTuning.ts': ['__DEVSEAM_enemyTuning_enemyKnobs__'],
  'src/scenes/BootScene.ts': [
    '__DEVSEAM_BootScene_breakAssetCatalog__',
    '__DEVSEAM_BootScene_breakFilter__',
    '__DEVSEAM_BootScene_stopDevScenes__',
  ],
  'src/scenes/GameScene.ts': [
    '__DEVSEAM_GameScene_bindKeysDevActions__',
    '__DEVSEAM_GameScene_feelTunerPass__',
  ],
  'src/scenes/bootAssets.ts': ['__DEVSEAM_bootAssets_breakAssetCorrupt__'],
  'src/scenes/devFeelTuner.ts': ['__DEVSEAM_devFeelTuner_createFeelTuner__'],
  'src/scenes/devMotionProbe.ts': ['__DEVSEAM_devMotionProbe_createMotionProbe__'],
  'src/scenes/devSpawn.ts': [
    '__DEVSEAM_devSpawn_spawnDevEnemies__',
    '__DEVSEAM_devSpawn_spawnDevFleet__',
  ],
  'src/scenes/gameDev.ts': [
    '__DEVSEAM_gameDev_attachDevOverlays__',
    '__DEVSEAM_gameDev_helpLineSuffix__',
    '__DEVSEAM_gameDev_spawnFleetKeyN__',
    '__DEVSEAM_gameDev_spawnLowHpKeyK__',
    '__DEVSEAM_gameDev_startDevScene__',
  ],
  'src/scenes/gameInput.ts': ['__DEVSEAM_gameInput_devKeyBindings__'],
  'src/scenes/gameLevelPick.ts': ['__DEVSEAM_gameLevelPick_hitstopScale__'],
  'src/scenes/gamePlayerDraw.ts': [
    '__DEVSEAM_gamePlayerDraw_feelAnimRate__',
    '__DEVSEAM_gamePlayerDraw_feelSpeedScale__',
    '__DEVSEAM_gamePlayerDraw_feelTunerCallback__',
  ],
  'src/scenes/gymKeys.ts': ['__DEVSEAM_gymKeys_bindGymKeys__'],
};
