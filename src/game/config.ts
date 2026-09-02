import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { ElementEditorScene } from '../scenes/ElementEditorScene';
import { GymScene } from '../scenes/GymScene';
import { LevelSelectScene } from '../scenes/LevelSelectScene';
import { PlaygroundScene } from '../scenes/PlaygroundScene';
import { TitleScene } from '../scenes/TitleScene';
import { UIScene } from '../scenes/UIScene';
import { GAME_HEIGHT, GAME_WIDTH, PHASER_RNG_SEED } from './constants';
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
     * 🔴 **`FIT` stays — what changed on 2026-09-01 is the SIZE it fits.**
     *
     * The default mode is NONE (0), so this line is not optional. Under a FIXED 1920x1080 view a
     * landscape phone (~19.5:9 = 2.17) left **17.9 % of the width black** — 151 CSS px on an
     * iPhone 14, 160 on a Pixel 7, which is what the owner reported as "a lot less space on the
     * right and left". The answer is `src/game/viewSize.ts`: it gives the view the viewport's own
     * aspect at a fixed height, so `FIT` has nothing left to letterbox.
     *
     * `Phaser.Scale.EXPAND` computes that size itself and would look like the obvious choice. It
     * is not usable here: its `min`/`max` clamp is applied to `displaySize`, which is also the CSS
     * style size, so clamping the view also clamps the canvas in CSS pixels. Measured, not
     * reasoned — the full account and the line numbers are in `viewSize.ts`.
     */
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Floor display/style sizes; avoids fractional CSS sizes that shimmer on scaled pixel art.
    autoRound: true,
    /**
     * **The design view, the guaranteed minimum, and the floor `viewSize.ts` clamps to.**
     *
     * No `min`/`max` here on purpose: they would reach `displaySize` and clamp the CSS size in the
     * bargain (see `viewSize.ts`). The view's bounds are `GAME_WIDTH` and `MAX_GAME_WIDTH`, applied
     * where the view is decided.
     */
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
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
