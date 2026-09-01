import Phaser from 'phaser';
import { devSeam } from './debug/devSeam';
import { gameConfig } from './game/config';
import { installDebugGlobals } from './debug/globals';
import { installCanvasFilter } from './game/canvasFilter';
import { installFullscreenOnTap } from './game/fullscreenOnTap';
import { installViewFill } from './game/viewSize';

installDebugGlobals();

const game = new Phaser.Game(gameConfig);

// The game FILLS the screen: the view takes the viewport's own aspect at a fixed 1080 height,
// clamped between GAME_WIDTH and MAX_GAME_WIDTH, so `Phaser.Scale.FIT` has nothing to letterbox.
// This is the answer to the black bars the owner reported in fullscreen on a phone. It must be
// installed before anything reads the view size — every scene lays out against `scale.gameSize`.
installViewFill(game.scale);

// `pixelArt: true` decides how TEXTURES are sampled onto the canvas. It says nothing about how the
// finished CANVAS is scaled onto the screen, and `Phaser.Scale.FIT` leaves the backing store at
// 1920x1080 while restyling its CSS size — so the browser rescales it at a fractional ratio, and
// `image-rendering: pixelated` makes that nearest-neighbour, which DROPS AND DUPLICATES pixel
// columns and reorganises them every frame the world scrolls. See `src/render/canvasScaling.ts`
// for the rule and the measurements; it is a Phase 1 decision reopened by the owner on 2026-08-27.
installCanvasFilter(game);

// The browser's own chrome is what keeps this game off a phone: the owner's landscape viewport is
// 798x283, which letterboxes to a 503 px canvas and puts every control 2.1 CSS px under the 44 px
// floor — so the rotate overlay stays up in landscape, correctly, and there is no button size that
// fixes it. Fullscreen removes the chrome instead of shrinking the game around it. See
// `fullscreenOnTap.ts` for the measurements and for why the listener is on the WRAPPER.
installFullscreenOnTap(document.getElementById('game'), game.scale, game.device.input.touch);

// DEV ONLY, and on the same side of the build gate as window.__game (vault 1.6). Vite folds
// `import.meta.env.DEV` to false in a production build, so this whole block is dropped.
//
// Exists so the e2e suite can restart the Boot scene. That is not a hypothetical: a restart
// re-enters Boot with the game-global texture and JSON caches already populated, which made
// the entire refuse-to-route gate a no-op. Without a handle, that regression cannot be tested
// from the outside at all.
if (import.meta.env.DEV) {
  devSeam('__DEVSEAM_main_phaserGameHandle__');
  (window as unknown as { __phaserGame: Phaser.Game }).__phaserGame = game;
}
