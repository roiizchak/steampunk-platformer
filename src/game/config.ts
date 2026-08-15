import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { ElementEditorScene } from '../scenes/ElementEditorScene';
import { GymScene } from '../scenes/GymScene';
import { PlaygroundScene } from '../scenes/PlaygroundScene';
import { UIScene } from '../scenes/UIScene';
import { GAME_HEIGHT, GAME_WIDTH, PHASER_RNG_SEED } from './constants';

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
    // The default scale mode is NONE (0), not FIT — without this line 1920x1080 renders
    // unscaled and overflows the viewport.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Floor display/style sizes; avoids fractional CSS sizes that shimmer on scaled pixel art.
    autoRound: true,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
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
  scene: import.meta.env.DEV
    ? [BootScene, GameScene, UIScene, PlaygroundScene, ElementEditorScene, GymScene]
    : [BootScene, GameScene, UIScene],
};
