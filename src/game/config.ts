import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { ElementEditorScene } from '../scenes/ElementEditorScene';
import { GymScene } from '../scenes/GymScene';
import { LevelSelectScene } from '../scenes/LevelSelectScene';
import { PlaygroundScene } from '../scenes/PlaygroundScene';
import { TitleScene } from '../scenes/TitleScene';
import { UIScene } from '../scenes/UIScene';
import { GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH, PHASER_RNG_SEED } from './constants';
import { devSeam } from '../debug/devSeam';

/**
 * The single filtering decision for this project, made once (vault 1.5).
 *
 * `pixelArt: true` makes Phaser's Config derive `antialias: false`, `antialiasGL: false`
 * and `roundPixels: true`. Those derived values — not a texture property — are what actually
 * select nearest-neighbour sampling; see the long comment in BootScene.assertFilteringPinned().
 */
export const PIXEL_ART = true;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  // Phaser.AUTO, never Phaser.WEBGL: WEBGL has no Canvas fallback and fails SILENTLY when
  // WebGL is unavailable. A silent failure is the exact class of bug this phase exists to forbid.
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12100e',
  pixelArt: PIXEL_ART,
  seed: [PHASER_RNG_SEED],
  scale: {
    /**
     * 🔴 **`EXPAND`, not `FIT`, since 2026-09-01 — the game fills the screen.**
     *
     * The default mode is NONE (0), so this line is not optional either way; what changed is which
     * non-default. Under FIT a landscape phone (~19.5:9 = 2.17) against a 16:9 game left **17.9 %
     * of the width black** — 151 CSS px on an iPhone 14, 160 on a Pixel 7, which is what the owner
     * reported as "a lot less space on the right and left".
     *
     * EXPAND grows the SHORT axis of the design box to match the viewport's aspect and leaves the
     * other at the configured value (`ScaleManager.js:1088-1134`). It reads `game.config.width` and
     * `.height` on every pass rather than the live `gameSize`, so it does not compound across
     * resizes — safe to leave running through rotations and fullscreen toggles.
     */
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Floor display/style sizes; avoids fractional CSS sizes that shimmer on scaled pixel art.
    autoRound: true,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    /**
     * **The clamp is what makes EXPAND cheap, and the height pin is the load-bearing half.**
     *
     * Height is fixed at `GAME_HEIGHT` at BOTH ends, so `GAME_HEIGHT` stays literally invariant and
     * every `gameH / GAME_HEIGHT` ratio in `src/render/` stays exactly 1 — the HUD, the touch
     * layout and the parallax all keep their measured sizes. Only the width breathes, between the
     * 1920 floor and the `MAX_GAME_WIDTH` ceiling.
     *
     * 🔴 Without the height pin, EXPAND in PORTRAIT produces a `gameSize` of 1920 x **4155** on a
     * 390 x 844 phone (`scaleX < scaleY`, so the height grows instead). That would scale the HUD by
     * 3.85x and make `cameraSetup` throw on every shipped level, since their heights are 2208-2688.
     * The rotate overlay is the intended answer to a portrait phone; a 4155 px view is not.
     *
     * ⚠️ `min` is **documentation, not a gate**: EXPAND's own arithmetic never produces either axis
     * below the configured base, so removing it changes nothing and no mutation can redden it.
     * Recorded rather than dressed up as a bound with a test — a gate that cannot go red is
     * decoration *(C2)*. `max` is real and is proved per-axis by M111a/M111b, which mutate to a
     * large finite value rather than deleting the property: `ScaleManager` only calls
     * `displaySize.setMax` `if (config.maxWidth > 0)`, so a deletion disables BOTH maxima and a
     * zero height clamps back up to `minHeight`. Named by the Codex plan review, round 4.
     */
    min: { width: GAME_WIDTH, height: GAME_HEIGHT },
    max: { width: MAX_GAME_WIDTH, height: GAME_HEIGHT },
    // 🔴 Send the WRAPPER fullscreen, not the canvas — and the difference is the rotate overlay.
    // Left to itself Phaser creates a blank `<div>`, moves ONLY the canvas into it and fullscreens
    // that, which strands `#rotate` outside the fullscreen subtree: a phone turned to portrait
    // while fullscreen would then show a frozen game with nothing explaining why. `#rotate` lives
    // inside `#game` in `index.html` for exactly this reason, and this line is the other half.
    // The sibling project at `C:\Claude\Street-Fighter` documents the same pair (`main.ts:37-41`).
    fullscreenTarget: 'game',
  },
  /**
   * Four simultaneous touch contacts.
   *
   * Phaser reserves one pointer for the mouse and creates `activePointers` touch pointers *in
   * addition* to it (`Config.js:279`, `InputManager.js:155, 178, 469`), so the default of 1 can
   * track exactly one finger — and criterion 12.3 is a thumb holding RIGHT while the other hand
   * jumps. Four covers every simultaneous GAMEPLAY action; pause immediately leaves gameplay and
   * has no simultaneous-use case. The cost is three extra `Pointer` instances.
   */
  input: { activePointers: 4 },
  // loader.maxRetries is left at Phaser 4's default of 2, so a 404 is attempted THREE times
  // before `loaderror` fires. Deliberate: retries are consistent with the no-timeout decision
  // (vault 1.4) and the failure direction stays safe. The consequence is that any test of the
  // refusal path must allow for three attempts, or a correct refusal reads as a hang.
  // Boot is first and therefore auto-started; Game is registered but idle until Boot's gate passes
  // and routes to it.
  //
  // **PlaygroundScene is DEV ONLY** and is appended only under `import.meta.env.DEV`, which Vite
  // statically folds to `false` in a production build — so the scene, and the whole `phaser` import
  // chain it pulls in, are dropped from `dist/`. It was registered unconditionally until the Codex
  // implementation review caught it (finding I2): PRD.md's file structure marks the scene DEV ONLY,
  // and a tuning console reachable in the shipped game is not a cosmetic difference.
  // `UIScene` is in BOTH arms: the HUD ships. It is registered but idle — `GameScene.create()`
  // launches it in parallel, which is the first `scene.launch` in this project.
  //
  // `LevelSelectScene` is in both arms for the same reason — the level menu ships (Phase 8). Boot
  // still routes to `Game`, not here: every Phase 1–7 spec asserts `sceneKey === 'Game'` after
  // `ready`, and a menu in front of the game would fail forty specs for a reason unrelated to what
  // they test. It is reached by ESC during play, and by finishing the last level.
  //
  // ⚠️ Registration order is also DRAW order for parallel scenes, which is why `UIScene` must stay
  // after `GameScene`: the HUD draws over the world, and `hudFade`'s overlay depends on it.
  scene: import.meta.env.DEV
    ? // A ternary arm has no statement position, so the sentinel rides a comma expression. See
      // `devSeam`'s header — this is the shape the criterion 10.2 gate owner named (brief B,
      // finding 11) for the four guards previously reported UNCOVERED.
      (devSeam('__DEVSEAM_config_devSceneRoster__'),
      [BootScene, GameScene, UIScene, LevelSelectScene, PlaygroundScene, ElementEditorScene, GymScene, TitleScene])
    : [BootScene, GameScene, UIScene, LevelSelectScene, TitleScene],
};
